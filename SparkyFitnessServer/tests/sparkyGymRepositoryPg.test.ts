/** Opt-in only after the main acceptance runner boots a fresh isolated server/DB. */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BODY_CIRCUMFERENCE_PARTS,
  sparkyGymDomainEventSchema,
} from '@workspace/shared';
import { endPool, getClient, getSystemClient } from '../db/poolManager.js';
import * as repo from '../models/sparkyGymRepository.js';

const enabled = process.env.SPARKYGYM_RUN_PG_TESTS === '1';
if (enabled && !/^sparkygym[_-]/.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
  throw new Error('SparkyGym PG tests require a fresh sparkygym_* database');
const owner = randomUUID();
const delegate = randomUUID();
const connectionId = randomUUID();
const categoryId = randomUUID();
const tables = [
  'connections',
  'streams',
  'outbox',
  'inbox',
  'entities',
  'source_heads',
  'notifications',
  'media',
  'snapshots',
  'snapshot_members',
];

describe.runIf(enabled)(
  'SparkyGym PostgreSQL owner persistence and BODY capture',
  () => {
    beforeAll(async () => {
      const client: PoolClient = await getSystemClient();
      try {
        for (const id of [owner, delegate])
          await client.query(
            'INSERT INTO public."user"(id,email,email_verified) VALUES($1,$2,true)',
            [id, `${id}@sparkygym.example.test`]
          );
        await client.query(
          `INSERT INTO family_access(owner_user_id,family_user_id,family_email,access_permissions,is_active,status)
        VALUES($1,$2,$3,'{"can_manage_checkin":true,"can_manage_diary":true,"can_view_reports":true}',true,'active')`,
          [owner, delegate, `${delegate}@sparkygym.example.test`]
        );
      } finally {
        client.release();
      }
      await repo.createConnection(owner, {
        id: connectionId,
        self_origin: 'https://sf.example.test',
        peer_origin: 'https://og.example.test',
        peer_user_id: 'peer-test',
        status: 'active',
        scopes: [
          'body_definition',
          'body_measurement',
          'body_goal',
          'exercise',
        ],
        credentials_encrypted: 'fixture-encrypted',
        invitation_public: {},
      });
    });
    afterAll(async () => {
      const client: PoolClient = await getSystemClient();
      try {
        await client.query(
          'DELETE FROM public."user" WHERE id=ANY($1::uuid[])',
          [[owner, delegate]]
        );
      } finally {
        client.release();
        await endPool();
      }
    });
    it('denies every integration table to a switched delegate', async () => {
      const client: PoolClient = await getClient(owner, delegate);
      try {
        for (const table of tables) {
          const result = await client.query(
            `SELECT * FROM sparkygym_${table} WHERE user_id=$1`,
            [owner]
          );
          expect(result.rows).toHaveLength(0);
        }
        await expect(
          client.query(
            `INSERT INTO sparkygym_notifications(user_id,resource,payload) VALUES($1,'exercise','{}')
`,
            [owner]
          )
        ).rejects.toThrow(/row-level security/i);
      } finally {
        client.release();
      }
    });
    it('denies direct arbitrary-owner enqueue helper calls', async () => {
      const client: PoolClient = await getClient(delegate);
      try {
        await expect(
          client.query(
            `SELECT sparkygym_private.emit($1,'body_goal','target_weight',NULL)
`,
            [owner]
          )
        ).rejects.toThrow(/permission denied/i);
      } finally {
        client.release();
      }
    });
    it('atomically captures canonical kg/cm with stable per-day metric IDs', async () => {
      await repo.withOwnerTransaction(owner, async (client) => {
        await client.query(
          `INSERT INTO check_in_measurements(user_id,entry_date,weight,neck,left_biceps) VALUES($1,'2026-10-29',75,38,31)
`,
          [owner]
        );
        const result = await client.query<{ body: string }>(
          `SELECT body FROM sparkygym_outbox WHERE user_id=$1 AND resource='body_measurement' ORDER BY entity_id
`,
          [owner]
        );
        const events = result.rows.map((row) =>
          sparkyGymDomainEventSchema.parse(JSON.parse(row.body))
        );
        expect(events.map((event) => event.entity_id)).toEqual([
          '2026-10-29:left_biceps',
          '2026-10-29:neck',
          '2026-10-29:weight',
        ]);
        expect(
          events.find((event) => event.entity_id.endsWith(':weight'))?.payload
        ).toMatchObject({ value: 75, unit: 'kg', measured_at: null });
        expect(
          events.find((event) => event.entity_id.endsWith(':neck'))?.payload
        ).toMatchObject({ value: 38, unit: 'cm' });
      });
    });
    it('captures all 18 circumference fields and does not resurrect cleared values in snapshots', async () => {
      await repo.withOwnerTransaction(owner, async (client) => {
        const keys = BODY_CIRCUMFERENCE_PARTS.map((part) => part.key);
        const values = keys.map((_, index) => index + 20);
        await client.query(
          `INSERT INTO check_in_measurements(user_id,entry_date,weight,${keys.join(',')}) VALUES($1,'2026-10-31',75,${keys.map((_, i) => `$${i + 2}`).join(',')})`,
          [owner, ...values]
        );
        const captured = await client.query<{ entity_id: string }>(
          `SELECT entity_id FROM sparkygym_outbox
           WHERE user_id=$1 AND resource='body_measurement' AND entity_id LIKE '2026-10-31:%'`,
          [owner]
        );
        expect(captured.rows.map((row) => row.entity_id)).toEqual(
          expect.arrayContaining(keys.map((key) => `2026-10-31:${key}`))
        );
        await client.query(
          `UPDATE check_in_measurements SET left_ankle=NULL,right_wrist=18
           WHERE user_id=$1 AND entry_date='2026-10-31'`,
          [owner]
        );
        const day = await client.query<{
          weight: string;
          left_ankle: null;
          right_ankle: string;
        }>(
          `SELECT weight,left_ankle,right_ankle FROM check_in_measurements
           WHERE user_id=$1 AND entry_date='2026-10-31'`,
          [owner]
        );
        expect(Number(day.rows[0].weight)).toBe(75);
        expect(day.rows[0].left_ankle).toBeNull();
        expect(Number(day.rows[0].right_ankle)).toBe(
          values[keys.indexOf('right_ankle')]
        );
        const deleted = await client.query<{ operation: string }>(
          `SELECT body::jsonb->>'operation' AS operation FROM sparkygym_outbox
           WHERE user_id=$1 AND resource='body_measurement' AND entity_id='2026-10-31:left_ankle'
           ORDER BY source_cursor DESC LIMIT 1`,
          [owner]
        );
        expect(deleted.rows[0].operation).toBe('delete');
        const snapshot = await client.query<{
          entity_id: string;
          payload: { unit: string; value: number };
        }>(
          `SELECT entity_id,payload FROM public.sparkygym_body_snapshot()
           WHERE resource='body_measurement' AND entity_id LIKE '2026-10-31:%'`
        );
        expect(
          snapshot.rows.some((row) => row.entity_id.endsWith(':left_ankle'))
        ).toBe(false);
        expect(
          snapshot.rows.find((row) => row.entity_id.endsWith(':right_wrist'))
            ?.payload
        ).toMatchObject({ value: 18, unit: 'cm' });
      });
    });
    it('rolls back source writes and queued events together', async () => {
      await expect(
        repo.withOwnerTransaction(owner, async (client) => {
          await client.query(
            `INSERT INTO check_in_measurements(user_id,entry_date,weight) VALUES($1,'2026-10-28',80)
`,
            [owner]
          );
          throw new Error('rollback fixture');
        })
      ).rejects.toThrow('rollback fixture');
      const client: PoolClient = await getClient(owner);
      try {
        expect(
          (
            await client.query(
              `SELECT * FROM sparkygym_outbox WHERE user_id=$1 AND entity_id='2026-10-28:weight'
`,
              [owner]
            )
          ).rows
        ).toHaveLength(0);
      } finally {
        client.release();
      }
    });
    it('clearing one metric tombstones it without erasing its siblings', async () => {
      await repo.withOwnerTransaction(owner, async (client) => {
        await client.query(
          `UPDATE check_in_measurements SET weight=NULL WHERE user_id=$1 AND entry_date='2026-10-29'
`,
          [owner]
        );
        const rows = await client.query<{ body: string }>(
          `SELECT body FROM sparkygym_outbox WHERE user_id=$1 AND entity_id='2026-10-29:weight' ORDER BY revision DESC LIMIT 1
`,
          [owner]
        );
        expect(
          sparkyGymDomainEventSchema.parse(JSON.parse(rows.rows[0]!.body))
        ).toMatchObject({ operation: 'delete', payload: null, revision: 2 });
        expect(
          (
            await client.query(
              `SELECT * FROM sparkygym_outbox WHERE user_id=$1 AND entity_id='2026-10-29:neck'
`,
              [owner]
            )
          ).rows
        ).toHaveLength(1);
      });
    });
    it('captures only target_weight from onboarding and emits a goal tombstone', async () => {
      await repo.withOwnerTransaction(owner, async (client) => {
        await client.query(
          'INSERT INTO onboarding_data(user_id,target_weight) VALUES($1,70) ON CONFLICT(user_id) DO UPDATE SET target_weight=70',
          [owner]
        );
        await client.query(
          'UPDATE onboarding_data SET meals_per_day=4 WHERE user_id=$1',
          [owner]
        );
        expect(
          (
            await client.query(
              `SELECT * FROM sparkygym_outbox WHERE user_id=$1 AND resource='body_goal'
`,
              [owner]
            )
          ).rows
        ).toHaveLength(1);
        await client.query(
          'UPDATE onboarding_data SET target_weight=NULL WHERE user_id=$1',
          [owner]
        );
        const result = await client.query<{ body: string }>(
          `SELECT body FROM sparkygym_outbox WHERE user_id=$1 AND resource='body_goal' ORDER BY revision DESC LIMIT 1
`,
          [owner]
        );
        expect(
          sparkyGymDomainEventSchema.parse(JSON.parse(result.rows[0]!.body))
        ).toMatchObject({ operation: 'delete', entity_id: 'target_weight' });
      });
    });
    it('retains unknown custom units as explicit text and timezone timestamps', async () => {
      await repo.withOwnerTransaction(owner, async (client) => {
        const sampleId = randomUUID();
        await client.query(
          `INSERT INTO custom_categories(id,user_id,name,measurement_type,frequency,data_type) VALUES($1,$2,'Pressure','mmHg','Daily','numeric')
`,
          [categoryId, owner]
        );
        await client.query(
          `INSERT INTO custom_measurements(id,user_id,category_id,value,entry_date,entry_timestamp) VALUES($1,$2,$3,'120','2026-10-29','2026-10-29T04:00:00Z')
`,
          [sampleId, owner, categoryId]
        );
        const result = await client.query<{ body: string }>(
          `SELECT body FROM sparkygym_outbox WHERE user_id=$1 AND resource='body_measurement' AND entity_id=$2
`,
          [owner, sampleId]
        );
        expect(
          sparkyGymDomainEventSchema.parse(JSON.parse(result.rows[0]!.body))
            .payload
        ).toMatchObject({
          metric_id: `custom:${categoryId}`,
          value: '120',
          unit: 'text',
          definition: { value_type: 'text', builtin: false },
          measured_at: '2026-10-29T04:00:00.000Z',
        });
        const secondId = randomUUID();
        await client.query(
          `INSERT INTO custom_measurements(id,user_id,category_id,value,entry_date,entry_timestamp) VALUES($1,$2,$3,'130','2026-10-29','2026-10-29T05:00:00Z')
`,
          [secondId, owner, categoryId]
        );
        const samples = await repo.captureBodySnapshot(client);
        expect(
          samples.filter(
            (item) => item.entity_id === sampleId || item.entity_id === secondId
          )
        ).toHaveLength(2);
      });
    });
    it.each([
      ['-2.5', -2.5],
      ['-2.5e2', -250],
      ['-2.5e-2', -0.025],
      ['+.25E+2', 25],
    ])(
      'retains finite signed custom numeric sample %s as number/none',
      async (storedValue, expectedValue) => {
        await repo.withOwnerTransaction(owner, async (client) => {
          const signedCategory = randomUUID();
          const sampleId = randomUUID();
          await client.query(
            `INSERT INTO custom_categories(id,user_id,name,measurement_type,frequency,data_type) VALUES($1,$2,$3,'none','Hourly','numeric')
`,
            [signedCategory, owner, `signed-${signedCategory}`]
          );
          await client.query(
            `INSERT INTO custom_measurements(id,user_id,category_id,value,entry_date,entry_timestamp) VALUES($1,$2,$3,$4,'2026-10-29','2026-10-29T06:00:00Z')
`,
            [sampleId, owner, signedCategory, String(storedValue)]
          );
          const result = await client.query<{ body: string }>(
            `SELECT body FROM sparkygym_outbox WHERE user_id=$1 AND resource='body_measurement' AND entity_id=$2
`,
            [owner, sampleId]
          );
          const expected = {
            metric_id: `custom:${signedCategory}`,
            value: expectedValue,
            unit: 'none',
            definition: { value_type: 'number', builtin: false },
            measured_at: '2026-10-29T06:00:00.000Z',
          };
          expect(
            sparkyGymDomainEventSchema.parse(JSON.parse(result.rows[0]!.body))
              .payload
          ).toMatchObject(expected);
          const captured = await repo.captureBodySnapshot(client);
          expect(
            captured.find((item) => item.entity_id === sampleId)?.payload
          ).toMatchObject(expected);
        });
      }
    );
    it('captures paused BODY work without allowing transport to discard it', async () => {
      await repo.updateConnection(owner, connectionId, { status: 'paused' });
      try {
        await repo.withOwnerTransaction(owner, async (client) => {
          await client.query(
            `INSERT INTO check_in_measurements(user_id,entry_date,weight) VALUES($1,'2026-10-27',78)
`,
            [owner]
          );
          expect(
            (
              await client.query(
                `SELECT * FROM sparkygym_outbox WHERE user_id=$1 AND entity_id='2026-10-27:weight'
`,
                [owner]
              )
            ).rows
          ).toHaveLength(1);
        });
      } finally {
        await repo.updateConnection(owner, connectionId, { status: 'active' });
      }
    });
    it('records late activation confirmation without overriding an owner pause', async () => {
      await repo.updateConnection(owner, connectionId, {
        status: 'paused',
        activated_at: null,
      });
      try {
        const confirmed = await repo.confirmActivation(owner, connectionId);
        expect(confirmed?.status).toBe('paused');
        expect(confirmed?.activated_at).toBeInstanceOf(Date);
      } finally {
        await repo.updateConnection(owner, connectionId, { status: 'active' });
      }
    });
    it('rejects mutation of persisted request bytes', async () => {
      const job = await repo.enqueueControl(owner, {
        connection_id: connectionId,
        path: '/api/integrations/v1/snapshot',
        body: '{}',
      });
      const client: PoolClient = await getClient(owner);
      try {
        await expect(
          client.query(
            `UPDATE sparkygym_outbox SET body='changed' WHERE id=$1
`,
            [job.id]
          )
        ).rejects.toThrow(/immutable/i);
      } finally {
        client.release();
      }
    });
    it('allows placeholder finalization only in the creation transaction', async () => {
      const jobId = await repo.withOwnerTransaction(owner, async (client) => {
        const job = await repo.enqueueControl(
          owner,
          {
            connection_id: connectionId,
            path: '/api/integrations/v1/snapshot',
            body: '{}',
          },
          client
        );
        await client.query(
          `UPDATE sparkygym_outbox SET body=$2,body_sha256=encode(sha256(convert_to($2,'UTF8')),'hex') WHERE id=$1
`,
          [job.id, '{"watermark":42}']
        );
        return job.id;
      });
      const client: PoolClient = await getClient(owner, owner);
      try {
        await expect(
          client.query(
            `UPDATE sparkygym_outbox SET body=$2,body_sha256=encode(sha256(convert_to($2,'UTF8')),'hex') WHERE id=$1
`,
            [jobId, '{}']
          )
        ).rejects.toThrow(/immutable/);
      } finally {
        client.release();
      }
    });
    it('acknowledges only the current lease token', async () => {
      const job = await repo.enqueueControl(owner, {
        connection_id: connectionId,
        path: '/api/integrations/v1/snapshot',
        body: '{}',
      });
      const token = randomUUID();
      await repo.withOwnerTransaction(owner, async (client) => {
        await client.query(
          `UPDATE sparkygym_outbox SET lease_token=$2,leased_until=now()+interval '90 seconds' WHERE id=$1
`,
          [job.id, token]
        );
      });
      expect(
        await repo.acknowledgeOutbox(
          owner,
          job.id,
          { status: 'ok' },
          undefined,
          randomUUID()
        )
      ).toBe(false);
      expect(
        await repo.acknowledgeOutbox(
          owner,
          job.id,
          { status: 'ok' },
          undefined,
          token
        )
      ).toBe(true);
    });
    it('reads strict complete BODY membership under the owner boundary', async () => {
      const snapshotId = await repo.enqueueSnapshot(
        owner,
        connectionId,
        repo.captureBodySnapshot,
        async (_client, items, id) => {
          expect(id).toMatch(/^[a-f0-9-]{36}$/);
          expect(
            items.find((item) => item.entity_id === '2026-10-29:neck')
          ).toBeDefined();
          expect(
            items.find((item) => item.entity_id === '2026-10-29:weight')
          ).toBeUndefined();
          for (const item of items) {
            expect(
              sparkyGymDomainEventSchema.safeParse({
                version: 1,
                event_id: randomUUID(),
                connection_id: connectionId,
                producer: 'sparkyfitness',
                source_cursor: 1,
                revision: 1,
                operation: 'upsert',
                occurred_at: '2026-10-29T00:00:00.000Z',
                ...item,
              }).success
            ).toBe(true);
          }
        }
      );
      expect(snapshotId).toBeTruthy();
    });
    it('commits projection, receipt, revision and notification once with exact-hash replay', async () => {
      const event = sparkyGymDomainEventSchema.parse({
        version: 1,
        event_id: randomUUID(),
        connection_id: connectionId,
        producer: 'opengym',
        resource: 'exercise',
        entity_id: 'fixture-exercise',
        revision: 1,
        source_cursor: 1,
        operation: 'delete',
        occurred_at: '2026-10-29T00:00:00.000Z',
        payload: null,
      });
      let applied = 0;
      const apply = async (client: PoolClient) => {
        applied++;
        await client.query('SELECT 1');
      };
      expect(
        (await repo.receiveEvent(owner, event, 'a'.repeat(64), apply)).status
      ).toBe('applied');
      expect(
        (await repo.receiveEvent(owner, event, 'a'.repeat(64), apply)).status
      ).toBe('duplicate');
      await expect(
        repo.receiveEvent(owner, event, 'b'.repeat(64), apply)
      ).rejects.toThrow('different bytes');
      expect(applied).toBe(1);
      expect(
        (await repo.replayNotifications(owner)).filter(
          (row) => row.payload.entity_id === 'fixture-exercise'
        )
      ).toHaveLength(1);
    });
    it('retains stale-event source heads through projection purge, receipt compaction and re-pair', async () => {
      const oldId = randomUUID();
      const newId = randomUUID();
      const origin = 'https://rewind.example.test';
      const peer = `${origin}\npeer-test`;
      const input = {
        self_origin: 'https://sf.example.test',
        peer_origin: origin,
        peer_user_id: 'peer-test',
        status: 'active' as const,
        scopes: ['exercise' as const],
        credentials_encrypted: 'fixture-encrypted',
        invitation_public: {},
      };
      await repo.createConnection(owner, { ...input, id: oldId });
      await repo.withOwnerTransaction(owner, async (client) => {
        await repo.advanceSourceHead(owner, peer, 50, client);
        await client.query(
          `INSERT INTO sparkygym_streams(user_id,connection_id,peer_ref,direction,resource,entity_id,revision) VALUES($1,$2,$3,'in','exercise','rewind-test',3)
`,
          [owner, oldId, peer]
        );
      });
      const base = {
        version: 1,
        event_id: randomUUID(),
        connection_id: oldId,
        producer: 'opengym',
        resource: 'exercise',
        entity_id: 'rewind-test',
        revision: 2,
        source_cursor: 51,
        operation: 'delete',
        occurred_at: '2026-10-29T00:00:00.000Z',
        payload: null,
      };
      let applied = 0;
      const receipt = await repo.receiveEvent(
        owner,
        sparkyGymDomainEventSchema.parse(base),
        'a'.repeat(64),
        async () => {
          applied++;
        }
      );
      expect(receipt).toMatchObject({ status: 'stale', revision: 3 });
      expect(applied).toBe(0);
      expect(await repo.getSourceHead(owner, peer)).toBe(51);
      await repo.withOwnerTransaction(owner, async (client) => {
        await client.query(
          'DELETE FROM sparkygym_entities WHERE user_id=$1 AND peer_ref=$2',
          [owner, peer]
        );
        await client.query(
          'DELETE FROM sparkygym_inbox WHERE user_id=$1 AND connection_id=$2',
          [owner, oldId]
        );
        await repo.updateConnection(
          owner,
          oldId,
          { status: 'revoked' },
          client
        );
        await repo.createConnection(owner, { ...input, id: newId }, client);
      });
      const restored = sparkyGymDomainEventSchema.parse({
        ...base,
        event_id: randomUUID(),
        connection_id: newId,
        revision: 1,
        source_cursor: 50,
      });
      await expect(
        repo.receiveEvent(owner, restored, 'b'.repeat(64), async () => {
          applied++;
        })
      ).rejects.toThrow('source_rewind');
      await repo.advanceSourceHead(owner, peer, 40);
      expect(await repo.getSourceHead(owner, peer)).toBe(51);
      expect(applied).toBe(0);
    });
  }
);
