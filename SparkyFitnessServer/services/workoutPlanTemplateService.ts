import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import { log } from '../config/logging.js';
import { resolveTemplateStartDay } from '../utils/timezoneLoader.js';

const TRAINING_FOCUS_TIME_SLOTS = [
  'morning',
  'noon',
  'afternoon',
  'evening',
] as const;

type TrainingFocusTimeSlot = (typeof TRAINING_FOCUS_TIME_SLOTS)[number];

function normalizePlanMode(planData: any): 'detailed' | 'training_focus' {
  return planData.plan_mode === 'training_focus'
    ? 'training_focus'
    : 'detailed';
}

function normalizeTrainingFocus(value: unknown): string {
  const focus = typeof value === 'string' ? value.trim() : '';
  return focus.length > 0 ? focus : 'rest';
}

export function normalizeTrainingFocusSessions(
  sessions: any[] | undefined | null
) {
  const byDay = new Map<number, Map<TrainingFocusTimeSlot, any>>();

  for (const session of sessions ?? []) {
    const day = Number(session.day_of_week);
    const slot = session.time_slot as TrainingFocusTimeSlot;
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error(
        'Training focus session day_of_week must be 0 through 6.'
      );
    }
    if (!TRAINING_FOCUS_TIME_SLOTS.includes(slot)) {
      throw new Error('Training focus session time_slot is invalid.');
    }

    if (!byDay.has(day)) byDay.set(day, new Map());
    byDay.get(day)!.set(slot, {
      day_of_week: day,
      time_slot: slot,
      training_focus: normalizeTrainingFocus(session.training_focus),
      is_primary: Boolean(session.is_primary),
    });
  }

  const normalized = [];
  for (let day = 0; day < 7; day += 1) {
    const dayMap = byDay.get(day) ?? new Map();
    const daySessions = TRAINING_FOCUS_TIME_SLOTS.map((slot) => {
      const session = dayMap.get(slot);
      const trainingFocus = session?.training_focus ?? 'rest';
      return {
        day_of_week: day,
        time_slot: slot,
        training_focus: trainingFocus,
        is_primary: trainingFocus !== 'rest' && Boolean(session?.is_primary),
      };
    });

    const activeSessions = daySessions.filter(
      (session) => session.training_focus !== 'rest'
    );
    const primarySessions = daySessions.filter((session) => session.is_primary);

    if (activeSessions.length === 0 && primarySessions.length > 0) {
      throw new Error('Rest days cannot have a primary training session.');
    }
    if (activeSessions.length > 0 && primarySessions.length !== 1) {
      throw new Error(
        'Training days must have exactly one primary training session.'
      );
    }

    normalized.push(...daySessions);
  }

  return normalized;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWorkoutPlanTemplate(userId: any, planData: any) {
  log(
    'info',
    'createWorkoutPlanTemplate service - received planData:',
    planData
  );
  const planMode = normalizePlanMode(planData);
  const focusSessions =
    planMode === 'training_focus'
      ? normalizeTrainingFocusSessions(planData.focus_sessions)
      : [];

  // Validate assignments
  if (planMode === 'detailed' && planData.assignments) {
    for (const assignment of planData.assignments) {
      if (assignment.workout_preset_id) {
        const preset = await workoutPresetRepository.getWorkoutPresetById(
          assignment.workout_preset_id,
          userId
        );
        if (!preset) {
          throw new Error(
            `Workout Preset with ID ${assignment.workout_preset_id} not found.`
          );
        }
      }
      if (assignment.exercise_id) {
        const exercise = await exerciseRepository.getExerciseById(
          assignment.exercise_id,
          userId
        );
        if (!exercise) {
          throw new Error(
            `Exercise with ID ${assignment.exercise_id} not found.`
          );
        }
      }
    }
  }
  try {
    const newPlan =
      await workoutPlanTemplateRepository.createWorkoutPlanTemplate({
        ...planData,
        plan_mode: planMode,
        focus_sessions: focusSessions,
        assignments: planMode === 'training_focus' ? [] : planData.assignments,
        user_id: userId,
      });
    log(
      'info',
      'createWorkoutPlanTemplate service - newPlan created:',
      newPlan
    );
    if (newPlan.is_active && newPlan.plan_mode !== 'training_focus') {
      log(
        'info',
        `createWorkoutPlanTemplate service - New plan is active, creating exercise entries from template ${newPlan.id}`
      );
      const today = await resolveTemplateStartDay(
        userId,
        planData.currentClientDate
      );
      await exerciseRepository.createExerciseEntriesFromTemplate(
        newPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        'createWorkoutPlanTemplate service - New plan is not active, skipping exercise entry creation.'
      );
    }
    return newPlan;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error creating workout plan template for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to create workout plan template.', {
      cause: error,
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPlanTemplatesByUserId(userId: any) {
  return workoutPlanTemplateRepository.getWorkoutPlanTemplatesByUserId(userId);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPlanTemplateById(userId: any, templateId: any) {
  const template =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
      templateId,
      userId
    );
  if (!template) {
    throw new Error('Workout plan template not found.');
  }
  const ownerId =
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      templateId
    );
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have access to this workout plan template.'
    );
  }
  return template;
}

async function updateWorkoutPlanTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  log(
    'info',
    `updateWorkoutPlanTemplate service - received updateData for template ${templateId}:`,
    updateData
  );
  const ownerId =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      templateId,
      userId
    );
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to update this workout plan template.'
    );
  }
  const existingPlan =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
      templateId,
      userId
    );
  const mergedUpdateData = {
    ...existingPlan,
    ...updateData,
    assignments: updateData.assignments ?? existingPlan?.assignments,
    focus_sessions: updateData.focus_sessions ?? existingPlan?.focus_sessions,
  };
  const planMode = normalizePlanMode(mergedUpdateData);
  const focusSessions =
    planMode === 'training_focus'
      ? normalizeTrainingFocusSessions(mergedUpdateData.focus_sessions)
      : [];

  // Validate assignments if they are being updated
  if (planMode === 'detailed' && mergedUpdateData.assignments) {
    for (const assignment of mergedUpdateData.assignments) {
      if (assignment.workout_preset_id) {
        const preset = await workoutPresetRepository.getWorkoutPresetById(
          assignment.workout_preset_id,
          userId
        );
        if (!preset) {
          throw new Error(
            `Workout Preset with ID ${assignment.workout_preset_id} not found.`
          );
        }
      }
      if (assignment.exercise_id) {
        const exercise = await exerciseRepository.getExerciseById(
          assignment.exercise_id,
          userId
        );
        if (!exercise) {
          throw new Error(
            `Exercise with ID ${assignment.exercise_id} not found.`
          );
        }
      }
    }
  }
  try {
    const today = await resolveTemplateStartDay(
      userId,
      updateData.currentClientDate
    );
    // When a plan is updated, remove the old exercise entries that were created from it.
    log(
      'info',
      `updateWorkoutPlanTemplate service - Deleting old exercise entries for template ${templateId}`
    );
    await exerciseRepository.deleteExerciseEntriesByTemplateId(
      templateId,
      userId,
      today
    );
    const updatedPlan =
      await workoutPlanTemplateRepository.updateWorkoutPlanTemplate(
        templateId,
        userId,
        {
          ...mergedUpdateData,
          plan_mode: planMode,
          focus_sessions: focusSessions,
          assignments:
            planMode === 'training_focus' ? [] : mergedUpdateData.assignments,
        }
      );
    log(
      'info',
      'updateWorkoutPlanTemplate service - updatedPlan:',
      updatedPlan
    );
    if (updatedPlan.is_active && updatedPlan.plan_mode !== 'training_focus') {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Updated plan is active, creating exercise entries from template ${updatedPlan.id}`
      );
      await exerciseRepository.createExerciseEntriesFromTemplate(
        updatedPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        'updateWorkoutPlanTemplate service - Updated plan is not active, skipping exercise entry creation.'
      );
    }
    return updatedPlan;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error updating workout plan template ${templateId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to update workout plan template.', {
      cause: error,
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWorkoutPlanTemplate(userId: any, templateId: any) {
  log(
    'info',
    `deleteWorkoutPlanTemplate service - received templateId: ${templateId} for user: ${userId}`
  );
  const ownerId =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      templateId,
      userId
    );
  if (ownerId === null || ownerId === undefined) {
    throw new Error('Workout plan template not found.');
  }
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to delete this workout plan template.'
    );
  }
  try {
    // Delete future associated exercise entries, and decouple past ones via ON DELETE SET NULL
    log(
      'info',
      `deleteWorkoutPlanTemplate service - Deleting future associated exercise entries for template ${templateId}`
    );
    const today = await resolveTemplateStartDay(userId);
    await exerciseRepository.deleteExerciseEntriesByTemplateId(
      templateId,
      userId,
      today
    );
    const deleted =
      await workoutPlanTemplateRepository.deleteWorkoutPlanTemplate(
        templateId,
        userId
      );
    if (!deleted) {
      throw new Error(
        'Workout plan template not found or could not be deleted.'
      );
    }
    log('info', `Workout plan template ${templateId} deleted successfully.`);
    return { message: 'Workout plan template deleted successfully.' };
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error deleting workout plan template ${templateId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to delete workout plan template.', {
      cause: error,
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveWorkoutPlanForDate(userId: any, date: any) {
  return workoutPlanTemplateRepository.getActiveWorkoutPlanForDate(
    userId,
    date
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveTrainingFocusPlanForDate(userId: any, date: any) {
  return workoutPlanTemplateRepository.getActiveTrainingFocusPlanForDate(
    userId,
    date
  );
}
export { createWorkoutPlanTemplate };
export { getWorkoutPlanTemplatesByUserId };
export { getWorkoutPlanTemplateById };
export { updateWorkoutPlanTemplate };
export { deleteWorkoutPlanTemplate };
export { getActiveWorkoutPlanForDate };
export { getActiveTrainingFocusPlanForDate };
export default {
  createWorkoutPlanTemplate,
  getWorkoutPlanTemplatesByUserId,
  getWorkoutPlanTemplateById,
  updateWorkoutPlanTemplate,
  deleteWorkoutPlanTemplate,
  getActiveWorkoutPlanForDate,
  getActiveTrainingFocusPlanForDate,
};
