import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SparkyGymConnection } from '@workspace/shared';
import { sparkyGymDomainEventSchema } from '@workspace/shared';
import { applySparkyGymProjection } from '../integrations/opengym/projections.js';
import { SparkyGymService } from '../integrations/opengym/service.js';
import { sealSecrets } from '../integrations/opengym/security.js';
import { getSystemClient, endPool } from '../db/poolManager.js';
import * as repository from '../models/sparkyGymRepository.js';
import {
  handleSnapshot,
  enqueueBodySnapshot,
} from '../integrations/opengym/snapshots.js';

const enabled = process.env.SPARKYGYM_RUN_PG_TESTS === '1';
if (enabled && !/^sparkygym[_-]/.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
  throw new Error('Fresh sparkygym_* fixture required');
const owner = randomUUID(),
  peer = 'https://gym.example.test\npeer';
const sha = createHash('sha256').digest('hex');
let connection: SparkyGymConnection;
describe.runIf(enabled)('PostgreSQL snapshot rewind protection', () => {
  beforeAll(async () => {
    const client = await getSystemClient();
    try {
      await client.query(
        'INSERT INTO public."user"(id,email,email_verified) VALUES($1,$2,true)',
        [owner, `${owner}@sparkygym.example.test`]
      );
    } finally {
      client.release();
    }
    connection = await repository.createConnection(owner, {
      id: randomUUID(),
      self_origin: 'https://sf.example.test',
      peer_origin: 'https://gym.example.test',
      peer_user_id: 'peer',
      status: 'active',
      scopes: ['workout'],
      credentials_encrypted: 'fixture-only',
      invitation_public: { include_history: true },
    });
    await repository.withOwnerTransaction(owner, async (tx) => {
      await tx.query(
        `INSERT INTO sparkygym_entities(user_id,peer_ref,resource,entity_id,last_source_cursor) VALUES($1,$2,'workout','retained',50)
`,
        [owner, peer]
      );
      await repository.advanceSourceHead(owner, peer, 100, tx);
    });
  });
  afterAll(async () => {
    const client = await getSystemClient();
    try {
      await client.query('DELETE FROM public."user" WHERE id=$1', [owner]);
    } finally {
      client.release();
      await endPool();
    }
  });
  it('rejects a new rewound empty snapshot before recording it or pruning retained data', async () => {
    const packet = {
      version: 1 as const,
      action: 'begin' as const,
      connection_id: connection.id,
      snapshot_id: randomUUID(),
      start_cursor: 60,
      watermark: 60,
      expected_count: 0,
      membership_sha256: sha,
      prune_resources: ['workout' as const],
    };
    await expect(
      repository.withOwnerTransaction(owner, (tx) =>
        handleSnapshot(tx, connection, packet)
      )
    ).rejects.toThrow('source_rewind');
    await repository.withOwnerTransaction(owner, async (tx) => {
      expect(
        (
          await tx.query(
            'SELECT tombstone FROM sparkygym_entities WHERE user_id=$1 AND peer_ref=$2',
            [owner, peer]
          )
        ).rows
      ).toEqual([{ tombstone: false }]);
      expect(
        (
          await tx.query(
            'SELECT count(*)::int AS n FROM sparkygym_snapshots WHERE user_id=$1',
            [owner]
          )
        ).rows[0]?.n
      ).toBe(0);
    });
  });
  it('keeps exact completed snapshot retries idempotent even after newer live events', async () => {
    const snapshotId = randomUUID();
    await repository.withOwnerTransaction(owner, (tx) =>
      tx.query(
        `INSERT INTO sparkygym_snapshots
      (user_id,connection_id,snapshot_id,peer_ref,start_cursor,watermark,expected_count,membership_sha256,prune_resources,status)
      VALUES($1,$2,$3,$4,40,60,0,$5,'[]','complete')`,
        [owner, connection.id, snapshotId, peer, sha]
      )
    );
    const result = await repository.withOwnerTransaction(owner, (tx) =>
      handleSnapshot(tx, connection, {
        version: 1,
        action: 'begin',
        connection_id: connection.id,
        snapshot_id: snapshotId,
        start_cursor: 40,
        watermark: 60,
        expected_count: 0,
        membership_sha256: sha,
        prune_resources: [],
      })
    );
    expect(result.status).toBe('snapshot_complete');
    await repository.withOwnerTransaction(owner, async (tx) => {
      expect(
        (
          await tx.query(
            'SELECT tombstone FROM sparkygym_entities WHERE user_id=$1 AND peer_ref=$2',
            [owner, peer]
          )
        ).rows[0]?.tombstone
      ).toBe(false);
    });
  });

  it('repeated full snapshots update one workout and set, without allowing stale values to overwrite them', async () => {
    const entity = 'history-repeat';
    const payload = {
      workout_id: entity,
      name: 'History regression',
      date: '2026-10-29',
      timezone: 'Asia/Shanghai',
      started_at: null,
      ended_at: null,
      duration_seconds: null,
      calories_kcal: null,
      body_weight_kg: null,
      target_weight_kg: null,
      source_snapshot: { version: 1 },
      exercises: [
        {
          instance_id: 'instance-repeat',
          exercise_id: 'exercise-repeat',
          name: 'Squat',
          position: 0,
          source_snapshot: { version: 1 },
          sets: [
            {
              set_id: 'set-repeat',
              position: 0,
              kind: 'normal',
              completed: true,
              reps: 5,
              weight_kg: 50,
              duration_seconds: null,
              distance_meters: null,
              rpe: null,
              rir: null,
              load_mode: 'total',
              superset_group: null,
              topology: { version: 1 },
            },
          ],
        },
      ],
    };
    const hash = createHash('sha256')
      .update(`workout\0${entity}\n`)
      .digest('hex');
    const makeEvent = (revision: number, cursor: number, reps: number) =>
      sparkyGymDomainEventSchema.parse({
        version: 1,
        event_id: randomUUID(),
        connection_id: connection.id,
        producer: 'opengym',
        resource: 'workout',
        entity_id: entity,
        revision,
        source_cursor: cursor,
        operation: 'upsert',
        occurred_at: '2026-10-29T00:00:00.000Z',
        payload: {
          ...payload,
          exercises: payload.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) => ({ ...set, reps })),
          })),
        },
      });
    const receive = (event: ReturnType<typeof makeEvent>) =>
      repository.receiveEvent(
        owner,
        event,
        createHash('sha256').update(JSON.stringify(event)).digest('hex'),
        (tx, packet) => applySparkyGymProjection(tx, owner, peer, packet)
      );
    for (let revision = 1; revision <= 2; revision++) {
      const start = 200 + revision * 2;
      const snapshotId = randomUUID();
      await repository.withOwnerTransaction(owner, (tx) =>
        handleSnapshot(tx, connection, {
          version: 1,
          action: 'begin',
          connection_id: connection.id,
          snapshot_id: snapshotId,
          start_cursor: start,
          watermark: start + 1,
          expected_count: 1,
          membership_sha256: hash,
          prune_resources: ['workout'],
        })
      );
      const event = makeEvent(revision, start + 1, 5);
      expect((await receive(event)).status).toBe('applied');
      expect((await receive(event)).status).toBe('duplicate');
      await repository.withOwnerTransaction(owner, (tx) =>
        handleSnapshot(tx, connection, {
          version: 1,
          action: 'complete',
          connection_id: connection.id,
          snapshot_id: snapshotId,
        })
      );
    }
    await receive(makeEvent(3, 206, 8));
    expect((await receive(makeEvent(1, 207, 5))).status).toBe('stale');
    await repository.withOwnerTransaction(owner, async (tx) => {
      const sessions = await tx.query(
        "SELECT count(*)::int AS n FROM exercise_preset_entries WHERE user_id=$1 AND source='opengym'",
        [owner]
      );
      const entries = await tx.query(
        "SELECT count(*)::int AS n FROM exercise_entries WHERE user_id=$1 AND source='opengym'",
        [owner]
      );
      const sets = await tx.query(
        "SELECT s.reps FROM exercise_entry_sets s JOIN exercise_entries e ON e.id=s.exercise_entry_id WHERE e.user_id=$1 AND s.source='opengym'",
        [owner]
      );
      expect(sessions.rows[0]?.n).toBe(1);
      expect(entries.rows[0]?.n).toBe(1);
      expect(sets.rows).toEqual([{ reps: 8 }]);
    });
  });

  it('requires an acknowledged full outbound snapshot before retiring replacement credentials', async () => {
    const oldId = randomUUID();
    const old = await repository.createConnection(owner, {
      id: oldId,
      self_origin: connection.self_origin,
      peer_origin: 'https://rotation.example.test',
      peer_user_id: 'rotation-peer',
      status: 'active',
      scopes: ['body_measurement', 'workout'],
      invitation_public: { include_history: true },
      credentials_encrypted: sealSecrets(oldId, {
        version: 1,
        sf_nonce: Buffer.alloc(32, 2).toString('base64url'),
      }),
    });
    const next = await repository.createConnection(owner, {
      ...old,
      id: randomUUID(),
      replaces_connection_id: oldId,
    });
    await repository.withOwnerTransaction(owner, async (tx) => {
      const enqueue = async (prune: string[], acknowledgeComplete = true) => {
        const snapshotId = randomUUID();
        let completionId = '';
        for (const packet of [
          {
            version: 1,
            action: 'begin',
            snapshot_id: snapshotId,
            prune_resources: prune,
          },
          { version: 1, action: 'complete', snapshot_id: snapshotId },
        ]) {
          const job = await repository.enqueueControl(
            owner,
            {
              connection_id: next.id,
              path: '/api/integrations/v1/snapshot',
              body: JSON.stringify(packet),
            },
            tx
          );
          if (packet.action === 'complete') completionId = job.id;
          if (packet.action === 'begin' || acknowledgeComplete)
            await tx.query(
              "UPDATE sparkygym_outbox SET status='delivered' WHERE user_id=$1 AND id=$2",
              [owner, job.id]
            );
        }
        return completionId;
      };
      const service = new SparkyGymService();
      await enqueue([]);
      await service['finishRotation'](tx, next);
      expect((await repository.getConnection(owner, oldId, tx))?.status).toBe(
        'active'
      );
      const fullCompletion = await enqueue(['body_measurement'], false);
      await service['finishRotation'](tx, next);
      expect((await repository.getConnection(owner, oldId, tx))?.status).toBe(
        'active'
      );
      await tx.query(
        "UPDATE sparkygym_outbox SET status='delivered' WHERE user_id=$1 AND id=$2",
        [owner, fullCompletion]
      );
      await service['finishRotation'](tx, next);
      expect((await repository.getConnection(owner, oldId, tx))?.status).toBe(
        'active'
      );
      await tx.query(
        `INSERT INTO sparkygym_snapshots
        (user_id,connection_id,snapshot_id,peer_ref,start_cursor,watermark,expected_count,membership_sha256,prune_resources,status)
        VALUES($1,$2,$3,$4,1,1,0,$5,'["workout"]','complete')`,
        [
          owner,
          next.id,
          randomUUID(),
          `${next.peer_origin}\n${next.peer_user_id}`,
          sha,
        ]
      );
      await service['finishRotation'](tx, next);
      expect(
        (await repository.getConnection(owner, oldId, tx))?.last_error
      ).toBe('superseded_by_confirmed_snapshot');
    });
  });

  it('coalesces peer snapshot retries even after begin was acknowledged', async () => {
    const snapshotId = randomUUID();
    const outgoing = {
      ...connection,
      scopes: ['body_definition' as const, 'body_measurement' as const],
    };
    await repository.withOwnerTransaction(owner, async (tx) => {
      const begin = await repository.enqueueControl(
        owner,
        {
          connection_id: connection.id,
          path: '/api/integrations/v1/snapshot',
          body: JSON.stringify({
            version: 1,
            action: 'begin',
            connection_id: connection.id,
            snapshot_id: snapshotId,
            start_cursor: 101,
            watermark: 101,
            expected_count: 0,
            membership_sha256: sha,
            prune_resources: ['body_definition', 'body_measurement'],
          }),
        },
        tx
      );
      await tx.query(
        "UPDATE sparkygym_outbox SET status='delivered' WHERE user_id=$1 AND id=$2",
        [owner, begin.id]
      );
      await repository.enqueueControl(
        owner,
        {
          connection_id: connection.id,
          path: '/api/integrations/v1/snapshot',
          body: JSON.stringify({
            version: 1,
            action: 'complete',
            connection_id: connection.id,
            snapshot_id: snapshotId,
          }),
        },
        tx
      );
      expect(await enqueueBodySnapshot(tx, outgoing, true, true)).toBe(
        snapshotId
      );
      expect(await enqueueBodySnapshot(tx, outgoing, true, true)).toBe(
        snapshotId
      );
      const jobs = await tx.query(
        'SELECT count(*)::int AS n FROM sparkygym_outbox WHERE user_id=$1 AND connection_id=$2',
        [owner, connection.id]
      );
      expect(jobs.rows[0]?.n).toBe(2);
    });
  });
});
