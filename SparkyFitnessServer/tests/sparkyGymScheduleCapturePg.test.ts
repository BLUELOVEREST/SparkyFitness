/** Opt in only after booting the real isolated fixture with all migrations/RLS. */
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  sparkyGymDomainEventSchema,
  type SparkyGymConnection,
} from '@workspace/shared';
import { endPool, getClient, getSystemClient } from '../db/poolManager.js';
import * as repository from '../models/sparkyGymRepository.js';
import {
  enqueueBodySnapshot,
  handleSnapshot,
  membershipHash,
} from '../integrations/opengym/snapshots.js';

const enabled = process.env.SPARKYGYM_RUN_PG_TESTS === '1';
if (enabled && !/^sparkygym[_-]/.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
  throw new Error('Weekly hint PG tests require a fresh sparkygym_* database');
const owners: string[] = [];

async function fixture() {
  const owner = randomUUID();
  owners.push(owner);
  const client: PoolClient = await getSystemClient();
  try {
    await client.query(
      'INSERT INTO public."user"(id,email,email_verified) VALUES($1,$2,true)',
      [owner, `${owner}@hints.example.test`]
    );
  } finally {
    client.release();
  }
  const connection = await repository.createConnection(owner, {
    id: randomUUID(),
    self_origin: 'https://sf.example.test',
    peer_origin: 'https://og.example.test',
    peer_user_id: 'hints-peer',
    status: 'active',
    scopes: ['schedule_summary'],
    credentials_encrypted: 'fixture-only',
    invitation_public: { include_history: false },
  });
  return { owner, connection };
}
async function insertPlan(client: PoolClient, owner: string) {
  const result = await client.query<{ id: number }>(
    `INSERT INTO workout_plan_templates
    (user_id,plan_name,start_date,end_date,is_active,plan_mode,schedule_type,entry_mode)
    VALUES($1,$2,$3,$4,true,$5,$6,$7) RETURNING id`,
    [
      owner,
      'Future chest and football',
      '2026-11-02',
      '2026-11-08',
      'training_focus',
      'weekly',
      'prompt',
    ]
  );
  const id = result.rows[0]!.id;
  await client.query(
    `INSERT INTO workout_plan_focus_sessions(template_id,day_of_week,time_slot,training_focus,is_primary)
    VALUES($1,1,$2,$3,true),($1,1,$4,$5,false),($1,2,$2,$6,false)`,
    [id, 'morning', 'chest', 'evening', 'football', 'rest']
  );
  return id;
}
async function events(owner: string, after = 0) {
  const client: PoolClient = await getSystemClient();
  try {
    const result = await client.query<{ source_cursor: string; body: string }>(
      `SELECT source_cursor::text,body FROM sparkygym_outbox
      WHERE user_id=$1 AND resource=$2 AND source_cursor>$3 ORDER BY sparkygym_outbox.source_cursor`,
      [owner, 'schedule_summary', after]
    );
    return result.rows.map((row) => ({
      cursor: Number(row.source_cursor),
      event: sparkyGymDomainEventSchema.parse(JSON.parse(row.body)),
    }));
  } finally {
    client.release();
  }
}
async function snapshot(owner: string, connection: SparkyGymConnection) {
  return repository.withOwnerTransaction(owner, (client) =>
    enqueueBodySnapshot(client, connection, false)
  );
}

describe.runIf(enabled)('native SF weekly training hint capture', () => {
  afterAll(async () => {
    const client: PoolClient = await getSystemClient();
    try {
      await client.query('DELETE FROM public."user" WHERE id=ANY($1::uuid[])', [
        owners,
      ]);
      await client.query(
        'DELETE FROM public.sparkygym_archive_cleanup_jobs WHERE owner_id=ANY($1::uuid[])',
        [owners]
      );
    } finally {
      client.release();
      await endPool();
    }
  });

  it('atomically publishes one final future weekly intent with native buckets, dates, activity and main', async () => {
    const { owner } = await fixture();
    const id = await repository.withOwnerTransaction(owner, async (client) => {
      await client.query(
        'INSERT INTO user_preferences(user_id,timezone,first_day_of_week) VALUES($1,$2,1)',
        [owner, 'Asia/Shanghai']
      );
      const template = await insertPlan(client, owner);
      expect((await events(owner)).length).toBe(0); // no observer-visible intermediate state
      return template;
    });
    const captured = await events(owner);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.event).toMatchObject({
      producer: 'sparkyfitness',
      resource: 'schedule_summary',
      entity_id: String(id),
      operation: 'upsert',
      payload: {
        name: 'Future chest and football',
        timezone: 'Asia/Shanghai',
        week_start: 1,
        effective_from: '2026-11-02',
        effective_until: '2026-11-08',
        days: [
          {
            weekday: 1,
            slots: [
              { time_slot: 'morning', activity: 'chest', is_main: true },
              { time_slot: 'evening', activity: 'football', is_main: false },
            ],
          },
        ],
      },
    });
  });

  it('coalesces multi-row main edits and preference refreshes, and rolls back source/outbox together', async () => {
    const { owner, connection } = await fixture();
    const second = await repository.createConnection(owner, {
      id: randomUUID(),
      self_origin: connection.self_origin,
      peer_origin: connection.peer_origin,
      peer_user_id: 'second-hints-peer',
      status: 'active',
      scopes: ['schedule_summary'],
      credentials_encrypted: 'fixture-only',
      invitation_public: { include_history: false },
    });
    const id = await repository.withOwnerTransaction(owner, async (client) => {
      const template = await insertPlan(client, owner);
      await client.query(
        `INSERT INTO workout_plan_focus_sessions(template_id,day_of_week,time_slot,training_focus,is_primary)
        SELECT $1,day,slot,$2,false FROM generate_series(0,6) day CROSS JOIN unnest($3::text[]) slot
        ON CONFLICT(template_id,day_of_week,time_slot) DO NOTHING`,
        [template, 'rest', ['morning', 'noon', 'afternoon', 'evening']]
      );
      return template;
    });
    const before = (await events(owner)).at(-1)!.cursor;
    let finalSourcePayload: unknown;
    await repository.withOwnerTransaction(owner, async (client) => {
      await client.query(
        'UPDATE workout_plan_templates SET plan_name=plan_name WHERE id=$1',
        [id]
      );
      await client.query(
        'UPDATE workout_plan_focus_sessions SET training_focus=training_focus WHERE template_id=$1',
        [id]
      );
      await client.query(
        'UPDATE workout_plan_focus_sessions SET is_primary=false WHERE template_id=$1',
        [id]
      );
      await client.query(
        'UPDATE workout_plan_focus_sessions SET is_primary=true WHERE template_id=$1 AND time_slot=$2 AND day_of_week=1',
        [id, 'evening']
      );
      await client.query(
        'INSERT INTO user_preferences(user_id,timezone,first_day_of_week) VALUES($1,$2,6)',
        [owner, 'America/Los_Angeles']
      );
      const source = await client.query<{ payload: unknown }>(
        'SELECT payload FROM public.sparkygym_schedule_snapshot() WHERE entity_id=$1',
        [String(id)]
      );
      finalSourcePayload = source.rows[0]!.payload;
      expect(await events(owner, before)).toEqual([]);
    });
    const changed = await events(owner, before);
    expect(changed).toHaveLength(2);
    expect(changed.map((row) => row.event.connection_id).sort()).toEqual(
      [connection.id, second.id].sort()
    );
    for (const row of changed)
      expect(row.event.payload).toEqual(finalSourcePayload);
    for (const row of changed)
      expect(row.event).toMatchObject({
        payload: {
          timezone: 'America/Los_Angeles',
          week_start: 6,
          days: [
            {
              slots: [
                { is_main: false },
                { activity: 'football', is_main: true },
              ],
            },
          ],
        },
      });
    const cursor = changed.at(-1)!.cursor;
    await expect(
      repository.withOwnerTransaction(owner, async (client) => {
        await client.query(
          'UPDATE workout_plan_templates SET plan_name=$2 WHERE id=$1',
          [id, 'rolled back']
        );
        await client.query('SET CONSTRAINTS ALL IMMEDIATE');
        throw new Error('rollback fixture');
      })
    ).rejects.toThrow('rollback fixture');
    expect(await events(owner, cursor)).toEqual([]);
    await snapshot(owner, (await repository.listConnections(owner))[0]!);
    expect((await events(owner, cursor))[0]!.event).toMatchObject({
      payload: { name: 'Future chest and football' },
    });
  });

  it('publishes preference-only changes, ignores unrelated preferences and rejects invalid final main state', async () => {
    const { owner } = await fixture();
    const id = await repository.withOwnerTransaction(owner, (client) =>
      insertPlan(client, owner)
    );
    let cursor = (await events(owner)).at(-1)!.cursor;
    await repository.withOwnerTransaction(owner, (client) =>
      client.query(
        'INSERT INTO user_preferences(user_id,timezone,first_day_of_week) VALUES($1,$2,1)',
        [owner, 'Pacific/Auckland']
      )
    );
    expect(await events(owner, cursor)).toHaveLength(1);
    cursor = (await events(owner)).at(-1)!.cursor;
    await repository.withOwnerTransaction(owner, (client) =>
      client.query(
        'UPDATE user_preferences SET first_day_of_week=0 WHERE user_id=$1',
        [owner]
      )
    );
    expect((await events(owner, cursor))[0]!.event).toMatchObject({
      payload: { week_start: 0 },
    });
    cursor = (await events(owner)).at(-1)!.cursor;
    await repository.withOwnerTransaction(owner, (client) =>
      client.query(
        'UPDATE user_preferences SET timezone=timezone WHERE user_id=$1',
        [owner]
      )
    );
    expect(await events(owner, cursor)).toEqual([]);
    await expect(
      repository.withOwnerTransaction(owner, (client) =>
        client.query(
          'UPDATE workout_plan_focus_sessions SET is_primary=false WHERE template_id=$1',
          [id]
        )
      )
    ).rejects.toMatchObject({ code: '23514' });
    expect(await events(owner, cursor)).toEqual([]);
  });

  it('tombstones inactivation and deletion without publishing detailed or sequential templates', async () => {
    const { owner } = await fixture();
    const id = await repository.withOwnerTransaction(owner, (client) =>
      insertPlan(client, owner)
    );
    let cursor = (await events(owner)).at(-1)!.cursor;
    await repository.withOwnerTransaction(owner, (client) =>
      client.query(
        'UPDATE workout_plan_templates SET is_active=false WHERE id=$1',
        [id]
      )
    );
    expect(
      (await events(owner, cursor)).map((row) => row.event.operation)
    ).toEqual(['delete']);
    await repository.withOwnerTransaction(owner, (client) =>
      client.query(
        'UPDATE workout_plan_templates SET is_active=true WHERE id=$1',
        [id]
      )
    );
    cursor = (await events(owner)).at(-1)!.cursor;
    await repository.withOwnerTransaction(owner, (client) =>
      client.query('DELETE FROM workout_plan_templates WHERE id=$1', [id])
    );
    expect(
      (await events(owner, cursor)).map((row) => row.event.operation)
    ).toEqual(['delete']);
    cursor = (await events(owner)).at(-1)!.cursor;
    await repository.withOwnerTransaction(owner, (client) =>
      client.query(
        `INSERT INTO workout_plan_templates(user_id,plan_name,start_date,is_active,plan_mode,schedule_type)
      VALUES($1,$2,$3,true,$4,$5),($1,$2,$3,true,$6,$7)`,
        [
          owner,
          'Not a weekly focus hint',
          '2026-11-02',
          'detailed',
          'weekly',
          'training_focus',
          'sequential',
        ]
      )
    );
    expect(await events(owner, cursor)).toEqual([]);
  });

  it('includes current hint metadata in schedule-only no-history snapshots and finalizes same-TX packets', async () => {
    const { owner, connection } = await fixture();
    const id = await repository.withOwnerTransaction(owner, (client) =>
      insertPlan(client, owner)
    );
    const before = (await events(owner)).at(-1)!.cursor;
    const snapshotId = await repository.withOwnerTransaction(
      owner,
      async (client) => {
        const captured = await enqueueBodySnapshot(client, connection, false);
        await client.query(
          'UPDATE workout_plan_templates SET plan_name=$2,end_date=NULL WHERE id=$1',
          [id, 'Final transaction name']
        );
        return captured;
      }
    );
    const packets = await events(owner, before);
    expect(packets).toHaveLength(1);
    expect(packets[0]!.event).toMatchObject({
      payload: { name: 'Final transaction name', effective_until: null },
    });
    const client: PoolClient = await getSystemClient();
    try {
      const result = await client.query<{ body: string }>(
        'SELECT body FROM sparkygym_outbox WHERE user_id=$1 AND body::jsonb->>$2=$3 AND body::jsonb->>$4=$5',
        [owner, 'snapshot_id', snapshotId, 'action', 'begin']
      );
      expect(JSON.parse(result.rows[0]!.body)).toMatchObject({
        expected_count: 1,
        prune_resources: ['schedule_summary'],
      });
    } finally {
      client.release();
    }
    await expect(
      repository.withOwnerTransaction(owner, (client) =>
        handleSnapshot(client, connection, {
          version: 1,
          action: 'begin',
          connection_id: connection.id,
          snapshot_id: randomUUID(),
          start_cursor: 1,
          watermark: 1,
          expected_count: 0,
          membership_sha256: membershipHash([]),
          prune_resources: ['schedule_summary'],
        })
      )
    ).rejects.toThrow('invalid_snapshot_scope');
  });

  it('isolates source writers and actor-bound snapshots, and keeps owner-parameter helpers inaccessible', async () => {
    const first = await fixture();
    const second = await fixture();
    const id = await repository.withOwnerTransaction(first.owner, (client) =>
      insertPlan(client, first.owner)
    );
    const before = (await events(first.owner)).at(-1)!.cursor;
    const actor: PoolClient = await getClient(first.owner, second.owner);
    try {
      expect(
        (
          await actor.query(
            'SELECT * FROM public.sparkygym_schedule_snapshot()'
          )
        ).rows
      ).toEqual([]);
      await expect(
        actor.query('SELECT sparkygym_private.schedule_payload($1,$2)', [
          first.owner,
          id,
        ])
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        actor.query('SELECT sparkygym_private.emit($1,$2,$3,$4::jsonb)', [
          first.owner,
          'schedule_summary',
          String(id),
          '{}',
        ])
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      actor.release();
    }
    const stranger: PoolClient = await getClient(second.owner, second.owner);
    try {
      expect(
        (
          await stranger.query(
            'UPDATE workout_plan_templates SET plan_name=$2 WHERE id=$1',
            [id, 'spoofed']
          )
        ).rowCount
      ).toBe(0);
    } finally {
      stranger.release();
    }
    expect(await events(first.owner, before)).toEqual([]);
    expect(await events(second.owner)).toEqual([]);
  });
});
