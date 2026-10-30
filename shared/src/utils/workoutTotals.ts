import type { PresetSessionResponse } from '../schemas/api/ExerciseEntries.api.zod.ts';

/** A source summary is authoritative, including null (unknown). */
export function workoutCalories(
  session: Pick<PresetSessionResponse, 'source_summary' | 'exercises'>
): number | null {
  if (session.source_summary != null)
    return session.source_summary.calories_kcal;
  return session.exercises.reduce(
    (sum, exercise) => sum + (exercise.calories_burned ?? 0),
    0
  );
}

export function workoutDurationMinutes(
  session: Pick<PresetSessionResponse, 'source_summary' | 'exercises'>
): number | null {
  if (session.source_summary != null) {
    const seconds = session.source_summary.duration_seconds;
    return seconds === null ? null : seconds / 60;
  }
  return session.exercises.reduce(
    (sum, exercise) => sum + (exercise.duration_minutes ?? 0),
    0
  );
}
