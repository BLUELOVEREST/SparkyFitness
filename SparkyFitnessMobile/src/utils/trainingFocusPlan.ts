import type {
  TrainingFocusTimeSlot,
  WorkoutPlanFocusSession,
} from '../types/workoutPlan';
import { normalizeTrainingFocusValue } from '@workspace/shared';
import i18n from '../localization/i18n';
import type { TFunction } from 'i18next';

export function getTrainingFocusLabel(
  value: string,
  fallback: string,
  t: TFunction
): string {
  switch (value) {
    case 'rest':
      return t('workoutPlan.focusLabels.rest', { defaultValue: 'Rest' });
    case 'chest':
      return t('workoutPlan.focusLabels.chest', { defaultValue: 'Chest' });
    case 'back':
      return t('workoutPlan.focusLabels.back', { defaultValue: 'Back' });
    case 'legs':
      return t('workoutPlan.focusLabels.legs', { defaultValue: 'Legs' });
    case 'shoulders':
      return t('workoutPlan.focusLabels.shoulders', {
        defaultValue: 'Shoulders',
      });
    case 'arms':
      return t('workoutPlan.focusLabels.arms', { defaultValue: 'Arms' });
    case 'cardio':
      return t('workoutPlan.focusLabels.cardio', { defaultValue: 'Cardio' });
    case 'full_body':
      return t('workoutPlan.focusLabels.fullBody', {
        defaultValue: 'Full Body',
      });
    case 'custom':
      return t('workoutPlan.focusLabels.custom', { defaultValue: 'Custom' });
    default:
      return fallback;
  }
}

export {
  CUSTOM_TRAINING_FOCUS_VALUE,
  buildTrainingFocusOptions,
  buildTrainingFocusOptionsFromTemplates,
  resolveTrainingFocusValue,
} from '@workspace/shared';

export const TRAINING_FOCUS_TIME_SLOTS: {
  value: TrainingFocusTimeSlot;
  label: () => string;
}[] = [
  {
    value: 'morning',
    label: () => i18n.t('workoutPlan.morning', { defaultValue: 'Morning' }),
  },
  {
    value: 'noon',
    label: () => i18n.t('workoutPlan.noon', { defaultValue: 'Noon' }),
  },
  {
    value: 'afternoon',
    label: () => i18n.t('workoutPlan.afternoon', { defaultValue: 'Afternoon' }),
  },
  {
    value: 'evening',
    label: () => i18n.t('workoutPlan.evening', { defaultValue: 'Evening' }),
  },
];

const DAYS_OF_WEEK = [
  { id: 0 },
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
  { id: 5 },
  { id: 6 },
];

export function getDayName(dayOfWeek: number) {
  switch (dayOfWeek) {
    case 0:
      return i18n.t('medications.weekdays.sun', { defaultValue: 'Sunday' });
    case 1:
      return i18n.t('medications.weekdays.mon', { defaultValue: 'Monday' });
    case 2:
      return i18n.t('medications.weekdays.tue', { defaultValue: 'Tuesday' });
    case 3:
      return i18n.t('medications.weekdays.wed', { defaultValue: 'Wednesday' });
    case 4:
      return i18n.t('medications.weekdays.thu', { defaultValue: 'Thursday' });
    case 5:
      return i18n.t('medications.weekdays.fri', { defaultValue: 'Friday' });
    case 6:
      return i18n.t('medications.weekdays.sat', { defaultValue: 'Saturday' });
    default:
      return String(dayOfWeek);
  }
}

export function buildDefaultFocusSessions(
  initialSessions?: WorkoutPlanFocusSession[]
): WorkoutPlanFocusSession[] {
  return DAYS_OF_WEEK.flatMap((day) =>
    TRAINING_FOCUS_TIME_SLOTS.map(({ value }) => {
      const existing = initialSessions?.find(
        (session) =>
          Number(session.day_of_week) === day.id && session.time_slot === value
      );
      const trainingFocus = normalizeTrainingFocusValue(
        existing?.training_focus ?? 'rest'
      );
      return {
        day_of_week: day.id,
        time_slot: value,
        training_focus: trainingFocus,
        is_primary: trainingFocus !== 'rest' && Boolean(existing?.is_primary),
      };
    })
  );
}

function normalizeDayPrimary(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number
): WorkoutPlanFocusSession[] {
  const daySessions = sessions.filter(
    (session) => session.day_of_week === dayOfWeek
  );
  const activeSessions = daySessions.filter(
    (session) => session.training_focus !== 'rest'
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
        : session
    );
  }

  if (activeSessions.length === 0) {
    return sessions.map((session) =>
      session.day_of_week === dayOfWeek
        ? { ...session, is_primary: false }
        : session
    );
  }

  return sessions.map((session) =>
    session.day_of_week === dayOfWeek && session.training_focus === 'rest'
      ? { ...session, is_primary: false }
      : session
  );
}

export function updateTrainingFocusSession(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
  timeSlot: TrainingFocusTimeSlot,
  trainingFocus: string
): WorkoutPlanFocusSession[] {
  const updated = sessions.map((session) =>
    session.day_of_week === dayOfWeek && session.time_slot === timeSlot
      ? {
          ...session,
          training_focus: normalizeTrainingFocusValue(trainingFocus),
          is_primary:
            normalizeTrainingFocusValue(trainingFocus) !== 'rest' &&
            session.is_primary,
        }
      : session
  );

  return normalizeDayPrimary(updated, dayOfWeek);
}

export function setPrimaryTrainingFocusSession(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
  timeSlot: TrainingFocusTimeSlot
): WorkoutPlanFocusSession[] {
  return sessions.map((session) =>
    session.day_of_week === dayOfWeek
      ? {
          ...session,
          is_primary:
            session.time_slot === timeSlot && session.training_focus !== 'rest',
        }
      : session
  );
}

export function validateTrainingFocusSessions(
  sessions: WorkoutPlanFocusSession[]
): { valid: true } | { valid: false; message: string } {
  for (const day of DAYS_OF_WEEK) {
    const daySessions = sessions.filter(
      (session) => session.day_of_week === day.id
    );
    const activeSessions = daySessions.filter(
      (session) => session.training_focus !== 'rest'
    );
    const primarySessions = daySessions.filter((session) => session.is_primary);

    if (activeSessions.length > 0 && primarySessions.length !== 1) {
      return {
        valid: false,
        message: i18n.t('workoutPlan.mainSessionValidation', {
          defaultValue: '{{day}} must have exactly one main training session.',
          day: getDayName(day.id),
        }),
      };
    }
  }

  return { valid: true };
}
