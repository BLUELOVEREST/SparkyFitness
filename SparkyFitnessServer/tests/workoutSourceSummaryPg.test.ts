import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endPool, getClient, getSystemClient } from '../db/poolManager.js';
import { applySparkyGymProjection } from '../integrations/opengym/projections.js';
import { sparkyGymDomainEventSchema } from '@workspace/shared';
import { workoutTotalsRowsSql } from '../utils/workoutTotalsSql.js';
import { getGroupedExerciseSessionByIdWithClient } from '../services/exerciseEntryHistoryService.js';

const enabled = process.env.SPARKYGYM_RUN_PG_TESTS === '1';
if (enabled && process.env.SPARKY_FITNESS_DB_NAME !== 'sparkygym_acceptance')
  throw new Error(
    'Native summary PG tests require the isolated acceptance fixture'
  );
const owner = randomUUID();

describe.runIf(enabled)('native workout totals in PostgreSQL', () => {
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
  });
  it('protects preset-only activity details and both sides of reparenting', async () => {
    const imported = randomUUID(),
      local = randomUUID();
    const detail = randomUUID(),
      localDetail = randomUUID();
    const setup: PoolClient = await getSystemClient();
    try {
      await setup.query('BEGIN');
      await setup.query("SELECT set_config('app.sparkygym_import','on',true)");
      await setup.query(
        `INSERT INTO exercise_preset_entries(id,user_id,name,entry_date,source)
        VALUES($1,$2,'Guard imported','2026-10-30','opengym'),($3,$2,'Guard local','2026-10-30','manual')`,
        [imported, owner, local]
      );
      await setup.query(
        `INSERT INTO exercise_entry_activity_details(id,exercise_preset_entry_id,provider_name,detail_type,detail_data)
        VALUES($1,$2,'opengym','guard','{}'),($3,$4,'manual','guard','{}')`,
        [detail, imported, localDetail, local]
      );
      await setup.query('COMMIT');
    } finally {
      setup.release();
    }
    const client: PoolClient = await getClient(owner);
    try {
      for (const [sql, params] of [
        [
          "INSERT INTO exercise_entry_activity_details(exercise_preset_entry_id,provider_name,detail_type,detail_data) VALUES($1,'manual','guard','{}')",
          [imported],
        ],
        [
          'UPDATE exercise_entry_activity_details SET detail_data=\'{"tampered":true}\' WHERE id=$1',
          [detail],
        ],
        ['DELETE FROM exercise_entry_activity_details WHERE id=$1', [detail]],
        [
          'UPDATE exercise_entry_activity_details SET exercise_preset_entry_id=$2 WHERE id=$1',
          [detail, local],
        ],
        [
          'UPDATE exercise_entry_activity_details SET exercise_preset_entry_id=$2 WHERE id=$1',
          [localDetail, imported],
        ],
      ] as const)
        await expect(client.query(sql, [...params])).rejects.toMatchObject({
          code: 'P7001',
        });
      expect(
        (
          await client.query(
            'SELECT exercise_preset_entry_id FROM exercise_entry_activity_details WHERE id=$1',
            [detail]
          )
        ).rows
      ).toEqual([{ exercise_preset_entry_id: imported }]);
    } finally {
      client.release();
      const cleanup: PoolClient = await getSystemClient();
      try {
        await cleanup.query('BEGIN');
        await cleanup.query(
          "SELECT set_config('app.sparkygym_import','on',true)"
        );
        await cleanup.query(
          'DELETE FROM exercise_preset_entries WHERE id=ANY($1::uuid[])',
          [[imported, local]]
        );
        await cleanup.query('COMMIT');
      } finally {
        cleanup.release();
      }
    }
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
  it('rejects activity-detail insert, edit, delete and reparent through its real exercise_entry_id parent', async () => {
    const importedEntry = randomUUID();
    const localEntry = randomUUID();
    const importedDetail = randomUUID();
    const localDetail = randomUUID();
    const setup: PoolClient = await getSystemClient();
    try {
      await setup.query('BEGIN');
      await setup.query("SELECT set_config('app.sparkygym_import','on',true)");
      await setup.query(
        `INSERT INTO exercise_entries(id,user_id,exercise_name,duration_minutes,calories_burned,entry_date,source)
        VALUES($1,$2,$3,0,0,$4,$5),($6,$2,$3,0,0,$4,$7)`,
        [
          importedEntry,
          owner,
          'Source guard fixture',
          '2026-10-30',
          'opengym',
          localEntry,
          'manual',
        ]
      );
      await setup.query(
        `INSERT INTO exercise_entry_activity_details(id,exercise_entry_id,provider_name,detail_type,detail_data)
        VALUES($1,$2,$3,$4,$5::jsonb),($6,$7,$3,$4,$5::jsonb)`,
        [
          importedDetail,
          importedEntry,
          'opengym',
          'source_guard_fixture',
          '{}',
          localDetail,
          localEntry,
        ]
      );
      await setup.query('COMMIT');
    } catch (error) {
      await setup.query('ROLLBACK');
      throw error;
    } finally {
      setup.release();
    }
    const client: PoolClient = await getClient(owner, owner);
    try {
      await expect(
        client.query(
          `INSERT INTO exercise_entry_activity_details(exercise_entry_id,provider_name,detail_type,detail_data)
        VALUES($1,$2,$3,$4::jsonb)`,
          [importedEntry, 'manual', 'forbidden', '{}']
        )
      ).rejects.toMatchObject({ code: 'P7001' });
      await expect(
        client.query(
          'UPDATE exercise_entry_activity_details SET detail_data=$2::jsonb WHERE id=$1',
          [importedDetail, '{"tampered":true}']
        )
      ).rejects.toMatchObject({ code: 'P7001' });
      await expect(
        client.query(
          'DELETE FROM exercise_entry_activity_details WHERE id=$1',
          [importedDetail]
        )
      ).rejects.toMatchObject({ code: 'P7001' });
      await expect(
        client.query(
          'UPDATE exercise_entry_activity_details SET exercise_entry_id=$2 WHERE id=$1',
          [importedDetail, localEntry]
        )
      ).rejects.toMatchObject({ code: 'P7001' });
      await expect(
        client.query(
          'UPDATE exercise_entry_activity_details SET exercise_entry_id=$2 WHERE id=$1',
          [localDetail, importedEntry]
        )
      ).rejects.toMatchObject({ code: 'P7001' });
      const retained = await client.query<{ exercise_entry_id: string }>(
        'SELECT exercise_entry_id FROM exercise_entry_activity_details WHERE id=$1',
        [importedDetail]
      );
      expect(retained.rows).toEqual([{ exercise_entry_id: importedEntry }]);
    } finally {
      client.release();
      const cleanup: PoolClient = await getSystemClient();
      try {
        await cleanup.query('BEGIN');
        await cleanup.query(
          "SELECT set_config('app.sparkygym_import','on',true)"
        );
        await cleanup.query(
          'DELETE FROM exercise_entries WHERE id=ANY($1::uuid[])',
          [[importedEntry, localEntry]]
        );
        await cleanup.query('COMMIT');
      } finally {
        cleanup.release();
      }
    }
  });
  it('projects exact totals once and reads empty, unknown and zero sessions without synthetic actions', async () => {
    const client: PoolClient = await getClient(owner);
    try {
      await client.query('BEGIN');
      for (const [id, duration, calories, children] of [
        ['real', 600.5, 123.25, 2],
        ['empty', 60.25, 12.5, 0],
        ['unknown', null, null, 1],
        ['zero', 0, 0, 0],
      ] as const) {
        const event = sparkyGymDomainEventSchema.parse({
          version: 1,
          event_id: randomUUID(),
          connection_id: randomUUID(),
          producer: 'opengym',
          resource: 'workout',
          entity_id: id,
          revision: 1,
          source_cursor: 1,
          operation: 'upsert',
          occurred_at: '2026-10-29T00:00:00.000Z',
          payload: {
            workout_id: id,
            name: id,
            date: '2026-10-29',
            timezone: 'UTC',
            started_at: null,
            ended_at: null,
            duration_seconds: duration,
            calories_kcal: calories,
            body_weight_kg: 75,
            target_weight_kg: 70,
            source_snapshot: { version: 1 },
            exercises: Array.from({ length: children }, (_, index) => ({
              instance_id: `${id}-${index}`,
              exercise_id: `${id}-${index}`,
              name: 'Real action',
              position: index,
              sets: [],
              source_snapshot: { version: 1 },
            })),
          },
        });
        await applySparkyGymProjection(client, owner, 'fixture-peer', event);
        const parent = await client.query<{ id: string }>(
          'SELECT id FROM exercise_preset_entries WHERE user_id=$1 AND name=$2',
          [owner, id]
        );
        const session = await getGroupedExerciseSessionByIdWithClient(
          client,
          owner,
          parent.rows[0]!.id
        );
        expect(session?.source_summary).toEqual({
          duration_seconds: duration,
          calories_kcal: calories,
        });
        expect(session?.exercises).toHaveLength(children);
        expect(session?.total_duration_minutes).toBe((duration ?? 0) / 60);
        for (const child of session?.exercises ?? []) {
          expect(child.calories_burned).toBe(0);
          expect(child.duration_minutes).toBe(0);
        }
      }
      const totals = await client.query<{
        calories: number;
        minutes: number;
        count: number;
      }>(
        `SELECT SUM(calories_burned)::float8 AS calories, SUM(duration_minutes)::float8 AS minutes, SUM(entry_count_weight)::int AS count FROM (${workoutTotalsRowsSql}) observations WHERE user_id=$1`,
        [owner]
      );
      expect(totals.rows[0]!.calories).toBe(135.75);
      expect(totals.rows[0]!.minutes).toBeCloseTo(660.75 / 60);
      expect(totals.rows[0]!.count).toBe(5);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
