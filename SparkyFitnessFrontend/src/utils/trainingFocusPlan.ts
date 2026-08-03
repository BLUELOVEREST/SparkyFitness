import type {
  TrainingFocusTimeSlot,
  WorkoutPlanFocusSession,
} from '@/types/workout';
export {
  BUILT_IN_TRAINING_FOCUS_OPTIONS,
  CUSTOM_TRAINING_FOCUS_OPTION,
  CUSTOM_TRAINING_FOCUS_VALUE,
  buildTrainingFocusOptions,
  buildTrainingFocusOptionsFromTemplates,
  isBuiltInTrainingFocus,
  normalizeTrainingFocusValue,
  resolveTrainingFocusValue,
} from '@workspace/shared';

export function orderItemsByFirstDay<T extends { id: number }>(
  items: T[],
  firstDayOfWeek: number
): T[] {
  return [...items].sort(
    (left, right) =>
      ((left.id - firstDayOfWeek + 7) % 7) -
      ((right.id - firstDayOfWeek + 7) % 7)
  );
}

export function setPrimaryTrainingFocusSession(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
  timeSlot: TrainingFocusTimeSlot
): WorkoutPlanFocusSession[] {
  return sessions.map((session) => {
    if (session.day_of_week !== dayOfWeek) return session;
    return {
      ...session,
      is_primary:
        session.time_slot === timeSlot && session.training_focus !== 'rest',
    };
  });
}

export function updateTrainingFocusSession(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
  timeSlot: TrainingFocusTimeSlot,
  trainingFocus: string
): WorkoutPlanFocusSession[] {
  const updated = sessions.map((session) => {
    if (session.day_of_week !== dayOfWeek || session.time_slot !== timeSlot) {
      return session;
    }

    return {
      ...session,
      training_focus: trainingFocus,
      is_primary: trainingFocus === 'rest' ? false : session.is_primary,
    };
  });

  const daySessions = updated.filter(
    (session) => session.day_of_week === dayOfWeek
  );
  const activeSessions = daySessions.filter(
    (session) => session.training_focus !== 'rest'
  );
  const primarySessions = daySessions.filter((session) => session.is_primary);

  if (activeSessions.length === 1 && primarySessions.length !== 1) {
    return setPrimaryTrainingFocusSession(
      updated,
      dayOfWeek,
      activeSessions[0]!.time_slot
    );
  }

  return updated;
}
