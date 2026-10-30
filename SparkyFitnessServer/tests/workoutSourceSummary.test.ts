import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  presetSessionResponseSchema,
  workoutCalories,
  workoutDurationMinutes,
  workoutSourceSummarySchema,
} from '@workspace/shared';
import { extractExerciseStats } from '../services/calorieBalanceService.js';
import { getGroupedExerciseSessionByIdWithClient } from '../services/exerciseEntryHistoryService.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const summary = { duration_seconds: 600.5, calories_kcal: 123.25 };
function session(
  sourceSummary:
    typeof summary | { duration_seconds: null; calories_kcal: null }
) {
  return presetSessionResponseSchema.parse({
    type: 'preset',
    id: 'parent',
    entry_date: '2026-10-29',
    workout_preset_id: null,
    name: 'Workout',
    description: null,
    notes: null,
    source: 'opengym',
    total_duration_minutes: 0,
    source_summary: sourceSummary,
    activity_details: [],
    exercises: [0, 1].map((index) => ({
      id: `child-${index}`,
      exercise_id: null,
      duration_minutes: 99,
      calories_burned: 999,
      entry_date: '2026-10-29',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: 'opengym',
      sets: [],
      exercise_snapshot: null,
      activity_details: [],
      superset_group: null,
    })),
  });
}

describe('native parent workout totals', () => {
  it('counts exact source calories once, never adding child placeholders or estimates', () => {
    const workout = session(summary);
    expect(workoutCalories(workout)).toBe(123.25);
    expect(workoutDurationMinutes(workout)).toBe(600.5 / 60);
    expect(extractExerciseStats([workout])).toEqual({
      activeCalories: 0,
      otherCalories: 123.25,
      activitySteps: 0,
    });
  });
  it('keeps unknown totals unknown rather than falling back to child observations', () => {
    const workout = session({ duration_seconds: null, calories_kcal: null });
    expect(workoutCalories(workout)).toBeNull();
    expect(workoutDurationMinutes(workout)).toBeNull();
    expect(extractExerciseStats([workout]).otherCalories).toBe(0);
  });
  it('distinguishes observed zero from unknown and preserves ordinary native workouts', () => {
    const workout = session({ duration_seconds: 0, calories_kcal: 0 });
    expect(workoutCalories(workout)).toBe(0);
    expect(workoutDurationMinutes(workout)).toBe(0);
    workout.source_summary = null;
    expect(workoutCalories(workout)).toBe(1998);
    expect(workoutDurationMinutes(workout)).toBe(198);
  });
  it('rejects negative measurements and private body context in the diary summary', () => {
    for (const value of [
      { ...summary, calories_kcal: -1 },
      { ...summary, duration_seconds: -1 },
      { ...summary, body_weight_kg: 75 },
      { ...summary, target_weight_kg: 70 },
    ])
      expect(workoutSourceSummarySchema.safeParse(value).success).toBe(false);
  });
  it.each([
    summary,
    { duration_seconds: null, calories_kcal: null },
    { duration_seconds: 0, calories_kcal: 0 },
  ])(
    'reads an empty parent without synthesizing an exercise: %j',
    async (sourceSummary) => {
      const query = vi.fn(async (sql: string) => ({
        rows: sql.includes('FROM exercise_preset_entries')
          ? [
              {
                id: 'parent',
                workout_preset_id: null,
                name: 'Workout',
                description: null,
                notes: null,
                source: 'opengym',
                entry_date: '2026-10-29',
                source_summary: sourceSummary,
              },
            ]
          : [],
      }));
      const client = { query } as unknown as PoolClient;
      const result = await getGroupedExerciseSessionByIdWithClient(
        client,
        'owner',
        'parent'
      );
      expect(result?.source_summary).toEqual(sourceSummary);
      expect(result?.exercises).toEqual([]);
      expect(result?.total_duration_minutes).toBe(
        (sourceSummary.duration_seconds ?? 0) / 60
      );
    }
  );
});
