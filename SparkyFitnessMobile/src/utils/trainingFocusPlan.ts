import type {
  TrainingFocusTimeSlot,
  WorkoutPlanFocusSession,
} from '../types/workoutPlan';

export const TRAINING_FOCUS_TIME_SLOTS: {
  value: TrainingFocusTimeSlot;
  label: string;
}[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'noon', label: 'Noon' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

export const TRAINING_FOCUS_OPTIONS = [
  { value: 'rest', label: 'Rest' },
  { value: 'chest', label: 'Chest' },
  { value: 'back', label: 'Back' },
  { value: 'legs', label: 'Legs' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'arms', label: 'Arms' },
  { value: 'cardio', label: 'Cardio' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'custom', label: 'Custom' },
];

const DAYS_OF_WEEK = [
  { id: 0, label: 'Sunday' },
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
  { id: 6, label: 'Saturday' },
];

export function getDayName(dayOfWeek: number) {
  return DAYS_OF_WEEK.find((day) => day.id === dayOfWeek)?.label ?? `Day ${dayOfWeek}`;
}

export function buildDefaultFocusSessions(
  initialSessions?: WorkoutPlanFocusSession[],
): WorkoutPlanFocusSession[] {
  return DAYS_OF_WEEK.flatMap((day) =>
    TRAINING_FOCUS_TIME_SLOTS.map(({ value }) => {
      const existing = initialSessions?.find(
        (session) =>
          Number(session.day_of_week) === day.id && session.time_slot === value,
      );
      const trainingFocus = existing?.training_focus ?? 'rest';
      return {
        day_of_week: day.id,
        time_slot: value,
        training_focus: trainingFocus,
        is_primary: trainingFocus !== 'rest' && Boolean(existing?.is_primary),
      };
    }),
  );
}

function normalizeDayPrimary(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
): WorkoutPlanFocusSession[] {
  const daySessions = sessions.filter((session) => session.day_of_week === dayOfWeek);
  const activeSessions = daySessions.filter(
    (session) => session.training_focus !== 'rest',
  );

  if (activeSessions.length === 1) {
    return sessions.map((session) =>
      session.day_of_week === dayOfWeek
        ? {
            ...session,
            is_primary:
              session.time_slot === activeSessions[0]?.time_slot &&
              session.training_focus !== 'rest',
          }
        : session,
    );
  }

  if (activeSessions.length === 0) {
    return sessions.map((session) =>
      session.day_of_week === dayOfWeek ? { ...session, is_primary: false } : session,
    );
  }

  return sessions.map((session) =>
    session.day_of_week === dayOfWeek && session.training_focus === 'rest'
      ? { ...session, is_primary: false }
      : session,
  );
}

export function updateTrainingFocusSession(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
  timeSlot: TrainingFocusTimeSlot,
  trainingFocus: string,
): WorkoutPlanFocusSession[] {
  const updated = sessions.map((session) =>
    session.day_of_week === dayOfWeek && session.time_slot === timeSlot
      ? {
          ...session,
          training_focus: trainingFocus.trim() || 'rest',
          is_primary:
            trainingFocus !== 'rest' && session.is_primary,
        }
      : session,
  );

  return normalizeDayPrimary(updated, dayOfWeek);
}

export function setPrimaryTrainingFocusSession(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
  timeSlot: TrainingFocusTimeSlot,
): WorkoutPlanFocusSession[] {
  return sessions.map((session) =>
    session.day_of_week === dayOfWeek
      ? {
          ...session,
          is_primary:
            session.time_slot === timeSlot && session.training_focus !== 'rest',
        }
      : session,
  );
}

export function validateTrainingFocusSessions(
  sessions: WorkoutPlanFocusSession[],
): { valid: true } | { valid: false; message: string } {
  for (const day of DAYS_OF_WEEK) {
    const daySessions = sessions.filter((session) => session.day_of_week === day.id);
    const activeSessions = daySessions.filter(
      (session) => session.training_focus !== 'rest',
    );
    const primarySessions = daySessions.filter((session) => session.is_primary);

    if (activeSessions.length > 0 && primarySessions.length !== 1) {
      return {
        valid: false,
        message: `${day.label} must have exactly one main training session.`,
      };
    }
  }

  return { valid: true };
}
