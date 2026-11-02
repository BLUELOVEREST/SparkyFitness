import { readFileSync } from 'node:fs';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type {
  SparkyGymDomainEvent,
  SparkyGymWorkoutPayload,
} from '@workspace/shared';
import { sparkyGymDomainEventSchema } from '@workspace/shared';
import * as projections from '../integrations/opengym/projections.js';
import errorHandler from '../middleware/errorHandler.js';
import type { Request, Response, NextFunction } from 'express';

const owner = '11111111-1111-4111-8111-111111111111';
const peer = 'opaque-og-owner';
const native = {
  version: 1 as const,
  note: 'https://example.com',
  rounds: [1, null],
};
const workout: SparkyGymWorkoutPayload = {
  workout_id: 'workout-1',
  name: 'strength',
  date: '2026-10-29',
  timezone: 'Asia/Shanghai',
  started_at: '2026-10-29T00:00:00.000Z',
  ended_at: null,
  duration_seconds: null,
  calories_kcal: null,
  body_weight_kg: null,
  target_weight_kg: null,
  exercises: [
    {
      instance_id: 'instance-1',
      exercise_id: 'exercise-1',
      name: 'squat',
      position: 0,
      source_snapshot: native,
      sets: [
        {
          set_id: 'set-1',
          position: 0,
          kind: 'normal',
          completed: true,
          reps: 5,
          weight_kg: 50,
          duration_seconds: 30.5,
          distance_meters: 1250,
          rpe: 8,
          rir: 2,
          load_mode: 'total',
          superset_group: 'superset-1',
          topology: native,
        },
      ],
    },
  ],
  source_snapshot: native,
};
function event(
  payload: SparkyGymWorkoutPayload = workout
): Extract<SparkyGymDomainEvent, { resource: 'workout'; operation: 'upsert' }> {
  const parsed = sparkyGymDomainEventSchema.parse({
    version: 1,
    event_id: owner,
    connection_id: owner,
    producer: 'opengym',
    resource: 'workout',
    entity_id: payload.workout_id,
    revision: 1,
    source_cursor: 1,
    operation: 'upsert',
    occurred_at: '2026-10-29T01:00:00.000Z',
    payload,
  });
  if (parsed.resource !== 'workout' || parsed.operation !== 'upsert')
    throw new Error('invalid_workout_fixture');
  return parsed;
}
type Call = { sql: string; values: unknown[] };
function fixture() {
  const calls: Call[] = [];
  const query = vi.fn(
    async (
      sql: string,
      values: unknown[] = []
    ): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), values });
      if (sql.includes('current_setting'))
        return { rows: [{ import_mode: '' }], rowCount: 1 };
      if (sql.includes('RETURNING id'))
        return { rows: [{ id: 42 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }
  );
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  return { client, calls, query };
}
function inserted(calls: Call[], table: string): Call {
  const call = calls.find((item) =>
    item.sql.startsWith(`INSERT INTO ${table} `)
  );
  expect(call, `missing insert ${table}`).toBeDefined();
  return call!;
}
function field(call: Call, name: string): unknown {
  const columns =
    /\(([^)]+)\)/
      .exec(call.sql)?.[1]
      .split(',')
      .map((value) => value.trim()) ?? [];
  const values =
    /VALUES\s*\(([^)]+)\)/i
      .exec(call.sql)?.[1]
      .split(',')
      .map((value) => value.trim()) ?? [];
  const expression = values[columns.indexOf(name)];
  const index = /^\$(\d+)/.exec(expression ?? '');
  return index ? call.values[Number(index[1]) - 1] : expression;
}

describe('SparkyGym native projections', () => {
  it('uses only the supplied transaction and restores the transaction-local import guard', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(client, owner, peer, event());
    expect(calls.some((call) => /BEGIN|COMMIT|ROLLBACK/.test(call.sql))).toBe(
      false
    );
    expect(
      calls
        .filter((call) =>
          call.sql.includes("set_config('app.sparkygym_import'")
        )
        .map((call) => call.values[0])
    ).toEqual(['on', '']);
    expect(client.release).not.toHaveBeenCalled();
  });
  it('creates a real private library item, diary parent, entry and workload sets', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(client, owner, peer, event());
    expect(field(inserted(calls, 'exercises'), 'source')).toBe("'opengym'");
    expect(field(inserted(calls, 'exercise_preset_entries'), 'source')).toBe(
      "'opengym'"
    );
    const entry = inserted(calls, 'exercise_entries');
    expect(field(entry, 'user_id')).toBe(owner);
    expect(field(entry, 'source')).toBe("'opengym'");
    expect(field(entry, 'entry_date')).toBe('2026-10-29');
    expect(field(entry, 'record_timezone')).toBe('Asia/Shanghai');
    expect(field(entry, 'exercise_preset_entry_id')).toBe(
      field(inserted(calls, 'exercise_preset_entries'), 'id')
    );
    const set = inserted(calls, 'exercise_entry_sets');
    expect(field(set, 'exercise_entry_id')).toBe(field(entry, 'id'));
    expect(field(set, 'weight')).toBe(50);
    expect(field(set, 'duration')).toBe(30.5);
    expect(field(set, 'distance')).toBe(1.25);
    expect(field(set, 'rpe')).toBe(8);
  });
  it('keeps empty native sessions and their actual totals visible in the diary', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(
      client,
      owner,
      peer,
      event({
        ...workout,
        exercises: [],
        calories_kcal: 150,
        duration_seconds: 600,
      })
    );
    const parent = inserted(calls, 'exercise_preset_entries');
    expect(JSON.parse(String(field(parent, 'source_summary')))).toEqual({
      duration_seconds: 600,
      calories_kcal: 150,
    });
    expect(
      calls.some((call) => call.sql.startsWith('INSERT INTO exercises '))
    ).toBe(false);
    expect(
      calls.some((call) => call.sql.startsWith('INSERT INTO exercise_entries '))
    ).toBe(false);
  });
  it('stores exact session totals only on the parent, not any real action', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(
      client,
      owner,
      peer,
      event({
        ...workout,
        duration_seconds: 120.5,
        calories_kcal: 42.25,
        body_weight_kg: 75.5,
        target_weight_kg: 70,
        exercises: [
          workout.exercises[0]!,
          { ...workout.exercises[0]!, instance_id: 'second', position: 1 },
        ],
      })
    );
    expect(
      JSON.parse(
        String(
          field(inserted(calls, 'exercise_preset_entries'), 'source_summary')
        )
      )
    ).toEqual({
      duration_seconds: 120.5,
      calories_kcal: 42.25,
    });
    const children = calls.filter((call) =>
      call.sql.startsWith('INSERT INTO exercise_entries ')
    );
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(field(child, 'duration_minutes')).toBe(0);
      expect(field(child, 'calories_burned')).toBe(0);
      expect(field(child, 'notes')).not.toContain('totals_on_first_instance');
      expect(field(child, 'notes')).toContain(
        'sparkygym_unknown_calories_kcal'
      );
    }
  });
  it('bounds native parent display names while keeping the full source name in raw history', async () => {
    const { client, calls } = fixture();
    const payload = { ...workout, name: 'x'.repeat(300) };
    await projections.applySparkyGymProjection(
      client,
      owner,
      peer,
      event(payload)
    );
    expect(
      String(field(inserted(calls, 'exercise_preset_entries'), 'name'))
    ).toHaveLength(255);
    const raw = JSON.parse(
      String(
        field(inserted(calls, 'exercise_entry_activity_details'), 'detail_data')
      )
    ) as { workout: SparkyGymWorkoutPayload };
    expect(raw.workout.name).toHaveLength(300);
  });
  it('fails closed rather than attaching a colliding manual library row', async () => {
    const { client, query, calls } = fixture();
    query.mockImplementation(async (sql, values = []) => {
      calls.push({ sql, values });
      return {
        rows: [],
        rowCount: sql.includes('INSERT INTO exercises') ? 0 : 1,
      };
    });
    await expect(
      projections.applySparkyGymProjection(client, owner, peer, event())
    ).rejects.toThrow('sparkygym_native_identity_conflict');
    expect(
      calls.some((call) => call.sql.includes('INSERT INTO exercise_entries'))
    ).toBe(false);
  });
  it('preserves full raw topology and labels native zero placeholders as unavailable', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(client, owner, peer, event());
    const entry = inserted(calls, 'exercise_entries');
    expect(field(entry, 'duration_minutes')).toBe(0);
    expect(field(entry, 'calories_burned')).toBe(0);
    expect(field(entry, 'notes')).toContain('sparkygym_unknown_calories_kcal');
    const detail = inserted(calls, 'exercise_entry_activity_details');
    const raw = JSON.parse(String(field(detail, 'detail_data'))) as {
      workout: SparkyGymWorkoutPayload;
    };
    expect(raw.workout).toEqual(workout);
  });
  it('retains stable instance/set IDs across reordering and connection rotation', async () => {
    const first = fixture();
    const second = fixture();
    await projections.applySparkyGymProjection(
      first.client,
      owner,
      peer,
      event()
    );
    const changed = event({
      ...workout,
      exercises: [
        {
          ...workout.exercises[0],
          position: 9,
          sets: [{ ...workout.exercises[0]!.sets[0]!, position: 7 }],
        },
      ],
    });
    await projections.applySparkyGymProjection(second.client, owner, peer, {
      ...changed,
      connection_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(field(inserted(first.calls, 'exercise_entries'), 'id')).toBe(
      field(inserted(second.calls, 'exercise_entries'), 'id')
    );
    expect(
      field(inserted(first.calls, 'exercise_entry_sets'), 'source_id')
    ).toBe(field(inserted(second.calls, 'exercise_entry_sets'), 'source_id'));
    expect(inserted(second.calls, 'exercise_entry_sets').sql).toContain(
      'ON CONFLICT'
    );
  });
  it('never interprets an unknown load mode as total weight or fabricates set completion time', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(
      client,
      owner,
      peer,
      event({
        ...workout,
        exercises: [
          {
            ...workout.exercises[0]!,
            sets: [
              {
                ...workout.exercises[0]!.sets[0]!,
                load_mode: 'unknown_native_mode',
              },
            ],
          },
        ],
      })
    );
    const set = inserted(calls, 'exercise_entry_sets');
    expect(field(set, 'weight')).toBeNull();
    expect(field(set, 'completed_at')).toBeNull();
    expect(field(set, 'notes')).toContain('sparkygym_unmapped_load_mode');
  });
  it('projects distance sets into the native distance modality without inventing load', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(
      client,
      owner,
      peer,
      event({
        ...workout,
        exercises: [
          {
            ...workout.exercises[0]!,
            sets: [
              {
                ...workout.exercises[0]!.sets[0]!,
                reps: null,
                weight_kg: null,
                load_mode: null,
              },
            ],
          },
        ],
      })
    );
    expect(field(inserted(calls, 'exercise_entries'), 'modality')).toBe(
      'duration_distance'
    );
  });
  it('preserves incomplete sets in raw data without counting planned workload', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(
      client,
      owner,
      peer,
      event({
        ...workout,
        exercises: [
          {
            ...workout.exercises[0]!,
            sets: [{ ...workout.exercises[0]!.sets[0]!, completed: false }],
          },
        ],
      })
    );
    const set = inserted(calls, 'exercise_entry_sets');
    for (const key of ['reps', 'weight', 'duration', 'distance'])
      expect(field(set, key)).toBeNull();
    expect(field(set, 'notes')).toContain('sparkygym_incomplete_set');
  });
  it('projects explicit exercise metadata without remote media or calculated calories', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(client, owner, peer, {
      ...event(),
      resource: 'exercise',
      entity_id: 'exercise-1',
      payload: {
        exercise_id: 'exercise-1',
        name: 'squat',
        category: 'strength',
        equipment: ['barbell'],
        primary_muscles: ['quads'],
        secondary_muscles: [],
        aliases: ['squat-alias'],
        notes: 'personal notes',
      },
    });
    const row = inserted(calls, 'exercises');
    expect(field(row, 'calories_per_hour')).toBeNull();
    expect(field(row, 'images')).toBeNull();
    expect(field(row, 'equipment')).toBe(JSON.stringify(['barbell']));
  });
  it('rejects SF-owned weekly hint resources before touching native plans or nutrition', async () => {
    const { client, calls } = fixture();
    await expect(
      projections.applySparkyGymProjection(client, owner, peer, {
        ...event(),
        producer: 'sparkyfitness',
        resource: 'schedule_summary',
        entity_id: 'schedule-1',
        payload: {
          name: 'Next week',
          timezone: 'Asia/Shanghai',
          week_start: 1,
          effective_from: '2026-10-29',
          effective_until: null,
          days: [
            {
              weekday: 1,
              slots: [
                {
                  time_slot: 'morning',
                  activity: 'strength',
                  is_main: true,
                },
              ],
            },
          ],
        },
      })
    ).rejects.toThrow('sparkygym_projection_direction');
    expect(calls).toEqual([]);
  });
  it('fails before SQL on wrong producer, body resources, and mismatched intrinsic entity IDs', async () => {
    for (const value of [
      { ...event(), producer: 'sparkyfitness' },
      { ...event(), entity_id: 'another-workout' },
    ]) {
      const { client, calls } = fixture();
      await expect(
        projections.applySparkyGymProjection(
          client,
          owner,
          peer,
          value as SparkyGymDomainEvent
        )
      ).rejects.toThrow();
      expect(calls).toHaveLength(0);
    }
  });
  it('deletes only the paired native workout and source-scoped purge rows', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(client, owner, peer, {
      ...event(),
      operation: 'delete',
      payload: null,
    });
    expect(
      calls.some(
        (call) =>
          /DELETE FROM exercise_preset_entries/.test(call.sql) &&
          call.sql.includes("source = 'opengym'") &&
          call.values.includes(owner)
      )
    ).toBe(true);
    await projections.purgeSparkyGymProjections(client, owner, peer);
    for (const call of calls.filter((item) =>
      item.sql.startsWith('DELETE FROM')
    )) {
      expect(call.sql).toContain("source = 'opengym'");
      expect(call.values).toContain(owner);
    }
    expect(calls.some((call) => /hevy|Health Connect/.test(call.sql))).toBe(
      false
    );
  });
  it('writes the root native mapping without changing source identity on rotation', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(client, owner, peer, event());
    const mapping = inserted(calls, 'sparkygym_entities');
    expect(mapping.sql).not.toContain('last_source_cursor');
    expect(mapping.sql).not.toContain('raw_payload');
    expect(mapping.sql).not.toContain('tombstone');
    expect(field(mapping, 'peer_ref')).toBe(peer);
    expect(field(mapping, 'local_id')).toBe(
      field(inserted(calls, 'exercise_preset_entries'), 'id')
    );
  });
  it('archives only personal-media metadata pending separately authenticated bytes', async () => {
    const { client, calls } = fixture();
    await projections.applySparkyGymProjection(client, owner, peer, {
      ...event(),
      resource: 'personal_media',
      entity_id: 'media-1',
      payload: {
        media_id: 'media-1',
        sha256: 'a'.repeat(64),
        bytes: 100,
        mime: 'image/jpeg',
        kind: 'workout',
        workout_id: 'workout-1',
        date: '2026-10-29',
        caption: 'personal caption',
      },
    });
    expect(inserted(calls, 'sparkygym_media').sql).toContain("'pending'");
    expect(
      calls.some((call) =>
        /UPDATE exercise_entries SET image_url/.test(call.sql)
      )
    ).toBe(false);
  });
  it('rejects unknown media or mismatched verification before linking archive readiness', async () => {
    const { client, query } = fixture();
    query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await expect(
      projections.markSparkyGymMediaReady(client, owner, owner, {
        sha256: 'a'.repeat(64),
        bytes: 100,
        mime: 'image/jpeg',
        private_path: '/tmp/archive/image.jpg',
      })
    ).rejects.toThrow('sparkygym_media_verification_mismatch');
  });
  it('changes archive identity when a media entity changes content hash', async () => {
    const media = {
      media_id: 'media-1',
      sha256: 'a'.repeat(64),
      bytes: 100,
      mime: 'image/jpeg' as const,
      kind: 'workout' as const,
      workout_id: 'workout-1',
      date: '2026-10-29',
      caption: '',
    };
    const first = fixture();
    const second = fixture();
    await projections.applySparkyGymProjection(first.client, owner, peer, {
      ...event(),
      resource: 'personal_media',
      entity_id: 'media-1',
      payload: media,
    });
    await projections.applySparkyGymProjection(second.client, owner, peer, {
      ...event(),
      resource: 'personal_media',
      entity_id: 'media-1',
      payload: { ...media, sha256: 'b'.repeat(64) },
    });
    expect(field(inserted(first.calls, 'sparkygym_media'), 'id')).not.toBe(
      field(inserted(second.calls, 'sparkygym_media'), 'id')
    );
  });
  it('links verified ready media through an authenticated owner route, not a private filesystem path', async () => {
    const { client, query, calls } = fixture();
    query.mockImplementation(async (sql, values = []) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), values });
      if (sql.includes('current_setting'))
        return { rows: [{ import_mode: '' }], rowCount: 1 };
      if (sql.includes('UPDATE sparkygym_media'))
        return { rows: [{ id: owner }], rowCount: 1 };
      if (sql.includes('SELECT e.peer_ref'))
        return {
          rows: [{ peer_ref: peer, workout_id: 'workout-1' }],
          rowCount: 1,
        };
      return { rows: [], rowCount: 1 };
    });
    await projections.markSparkyGymMediaReady(client, owner, owner, {
      sha256: 'a'.repeat(64),
      bytes: 100,
      mime: 'image/jpeg',
      private_path: '/tmp/private-image.jpg',
    });
    const link = calls.find((call) =>
      call.sql.startsWith('UPDATE exercise_entries SET image_url')
    )!;
    expect(link.sql).toContain("source = 'opengym'");
    expect(link.values).toContain(`/api/integrations/sparkygym/media/${owner}`);
    expect(link.values).not.toContain('/tmp/private-image.jpg');
    expect(link.values).toContain(owner);
  });
  it('matches HC provider/external-ID lineage only through an existing canonical native workout', async () => {
    const { client, query, calls } = fixture();
    query.mockImplementation(async (sql, values = []) => {
      calls.push({ sql, values });
      return { rows: [{ id: 42, local_id: owner }], rowCount: 1 };
    });
    expect(
      await projections.findSparkyGymHealthConnectCanonical(client, owner, {
        metadata: { dataOrigin: 'example.opengym', clientRecordId: 'native-1' },
      })
    ).toBe(owner);
    const call = calls[0]!;
    expect(call.values).toEqual([owner, 'example.opengym', 'native-1']);
    expect(call.sql).toContain('health_connect_lineage');
    expect(call.sql).toContain('exercise_preset_entries');
    expect(call.sql).toContain("source = 'opengym'");
    expect(call.sql).not.toMatch(/entry_date|reps|calories/);
  });
  it('keeps unproven and ambiguous HC records rather than deduplicating by date/name', async () => {
    const { client, query } = fixture();
    for (const raw of [
      null,
      {},
      { metadata: { dataOrigin: 'example.opengym' } },
      { provider: 'opengym', external_id: 'native-1' },
    ]) {
      expect(
        await projections.findSparkyGymHealthConnectCanonical(
          client,
          owner,
          raw
        )
      ).toBeNull();
    }
    expect(query).not.toHaveBeenCalled();
    query.mockImplementation(async () => ({
      rows: [
        { id: 1, local_id: owner },
        { id: 2, local_id: owner },
      ],
      rowCount: 2,
    }));
    expect(
      await projections.findSparkyGymHealthConnectCanonical(client, owner, {
        metadata: { dataOrigin: 'example.opengym', clientRecordId: 'native-1' },
      })
    ).toBeNull();
  });
});

describe('source ownership guards', () => {
  it('maps SQLSTATE P7001 to a stable 409 source_owned response', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    errorHandler(
      Object.assign(new Error('source_owned'), { code: 'P7001' }),
      {
        method: 'PATCH',
        originalUrl: '/api/v2/exercise-entries/fixture',
      } as Request,
      { status } as unknown as Response,
      vi.fn() as NextFunction
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'source_owned' })
    );
  });
  it('preserves source_owned when a native service wraps the DB error in a cause', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    errorHandler(
      new Error('wrapped', {
        cause: Object.assign(new Error('source_owned'), { code: 'P7001' }),
      }),
      {
        method: 'PATCH',
        originalUrl: '/api/v2/exercise-entries/fixture',
      } as Request,
      { status } as unknown as Response,
      vi.fn() as NextFunction
    );
    expect(status).toHaveBeenCalledWith(409);
  });
  it('installs database write guards on every source-owned native parent and set path', () => {
    const sql = readFileSync(
      new URL(
        '../db/migrations/20261029130000_sparkygym_source_guards.sql',
        import.meta.url
      ),
      'utf8'
    );
    expect(sql).toContain("ERRCODE = 'P7001'");
    expect(sql).toContain("current_setting('app.sparkygym_import', true)");
    for (const table of [
      'exercises',
      'exercise_entries',
      'exercise_entry_sets',
      'exercise_preset_entries',
    ]) {
      expect(
        sql.includes(`BEFORE INSERT OR UPDATE OR DELETE ON ${table}`) ||
          sql.includes(`BEFORE INSERT OR UPDATE OR DELETE ON public.${table}`)
      ).toBe(true);
    }
    expect(sql).toContain('public."user"');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).not.toContain('workout_plan_templates');
  });
});
