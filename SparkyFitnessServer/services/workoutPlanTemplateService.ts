import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import { log } from '../config/logging.js';
import { resolveTemplateStartDay } from '../utils/timezoneLoader.js';

export interface WorkoutPlanAssignmentSetInput {
  id?: number | string | null;
  set_number: number;
  set_type?: string | null;
  reps?: number | null;
  weight?: number | null;
  duration?: number | null;
  rest_time?: number | null;
  notes?: string | null;
}

export interface WorkoutPlanAssignmentInput {
  id?: number | string | null;
  day_of_week?: number | null;
  session_index?: number | null;
  session_name?: string | null;
  workout_preset_id?: number | string | null;
  exercise_id?: string | null;
  sort_order?: number | null;
  sets?: WorkoutPlanAssignmentSetInput[] | null;
}

export interface CreateWorkoutPlanTemplateInput {
  plan_name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  schedule_type?: 'weekly' | 'sequential';
  entry_mode?: 'prompt' | 'prefill';
  assignments?: WorkoutPlanAssignmentInput[] | null;
  currentClientDate?: string | null;
  plan_mode?: 'detailed' | 'training_focus';
  focus_sessions?: Array<{
    day_of_week: number;
    time_slot: string;
    training_focus: string;
    is_primary?: boolean;
  }> | null;
}

export interface UpdateWorkoutPlanTemplateInput {
  plan_name?: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean | null;
  schedule_type?: 'weekly' | 'sequential';
  entry_mode?: 'prompt' | 'prefill';
  assignments?: WorkoutPlanAssignmentInput[] | null;
  currentClientDate?: string | null;
  plan_mode?: 'detailed' | 'training_focus';
  focus_sessions?: Array<{
    day_of_week: number;
    time_slot: string;
    training_focus: string;
    is_primary?: boolean;
  }> | null;
}

const TRAINING_FOCUS_TIME_SLOTS = [
  'morning',
  'noon',
  'afternoon',
  'evening',
] as const;

type TrainingFocusTimeSlot = (typeof TRAINING_FOCUS_TIME_SLOTS)[number];
type TrainingFocusSessionInput = NonNullable<
  CreateWorkoutPlanTemplateInput['focus_sessions']
>[number];
type NormalizedFocusSession = Omit<TrainingFocusSessionInput, 'is_primary'> & {
  time_slot: TrainingFocusTimeSlot;
  is_primary: boolean;
};

function normalizePlanMode(planData: {
  plan_mode?: 'detailed' | 'training_focus';
}): 'detailed' | 'training_focus' {
  return planData.plan_mode === 'training_focus'
    ? 'training_focus'
    : 'detailed';
}

function normalizeTrainingFocus(value: unknown): string {
  const focus = typeof value === 'string' ? value.trim() : '';
  return focus.length > 0 ? focus : 'rest';
}

export function normalizeTrainingFocusSessions(
  sessions: TrainingFocusSessionInput[] | undefined | null
): NormalizedFocusSession[] {
  const byDay = new Map<
    number,
    Map<TrainingFocusTimeSlot, NormalizedFocusSession>
  >();

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

  const normalized: NormalizedFocusSession[] = [];
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
async function validateAndNormalizeAssignments(
  assignments: WorkoutPlanAssignmentInput[],
  scheduleType: 'weekly' | 'sequential',
  userId: string
): Promise<void> {
  for (const assignment of assignments) {
    if (scheduleType === 'weekly') {
      if (
        !Number.isInteger(assignment.day_of_week) ||
        (assignment.day_of_week ?? -1) < 0 ||
        (assignment.day_of_week ?? 7) > 6
      ) {
        throw new Error(
          'Weekly workout plan assignments must have a valid day_of_week (0-6).'
        );
      }
    } else {
      assignment.day_of_week = null;
    }
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

async function createWorkoutPlanTemplate(
  userId: string,
  planData: CreateWorkoutPlanTemplateInput
) {
  log(
    'info',
    'createWorkoutPlanTemplate service - received planData:',
    planData
  );
  const planMode = normalizePlanMode(planData);
  const scheduleType =
    planMode === 'training_focus'
      ? 'weekly'
      : (planData.schedule_type ?? 'sequential');
  const entryMode =
    scheduleType === 'sequential'
      ? 'prompt'
      : (planData.entry_mode ?? 'prompt');
  const focusSessions =
    planMode === 'training_focus'
      ? normalizeTrainingFocusSessions(planData.focus_sessions)
      : [];

  // Validate assignments
  if (planMode === 'detailed' && planData.assignments) {
    await validateAndNormalizeAssignments(
      planData.assignments,
      scheduleType,
      userId
    );
  }
  try {
    const newPlan =
      await workoutPlanTemplateRepository.createWorkoutPlanTemplate({
        ...planData,
        plan_mode: planMode,
        schedule_type: scheduleType,
        entry_mode: entryMode,
        focus_sessions: focusSessions,
        assignments: planMode === 'training_focus' ? [] : planData.assignments,
        user_id: userId,
      });
    log(
      'info',
      'createWorkoutPlanTemplate service - newPlan created:',
      newPlan
    );
    if (
      newPlan.is_active &&
      newPlan.plan_mode !== 'training_focus' &&
      newPlan.schedule_type === 'weekly' &&
      newPlan.entry_mode === 'prefill'
    ) {
      log(
        'info',
        `createWorkoutPlanTemplate service - New plan is active, weekly, and prefill, creating exercise entries from template ${newPlan.id}`
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
        'createWorkoutPlanTemplate service - Skipping exercise entry creation (inactive, sequential, or prompt mode).'
      );
    }
    return newPlan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error creating workout plan template for user ${userId}: ${message}`,
      error
    );
    throw new Error('Failed to create workout plan template.', {
      cause: error,
    });
  }
}

async function getWorkoutPlanTemplatesByUserId(userId: string) {
  return workoutPlanTemplateRepository.getWorkoutPlanTemplatesByUserId(userId);
}

async function getWorkoutPlanTemplateById(
  userId: string,
  templateId: string | number
) {
  // RLS already gates read access (owner or family-shared via
  // can_view_exercise_library). If the row comes back, the caller is allowed to
  // see it; an extra owner check here would wrongly 403 shared templates.
  const template =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
      templateId,
      userId
    );
  if (!template) {
    throw new Error('Workout plan template not found.');
  }
  return template;
}

/**
 * Updates a workout plan template owned by the user. For a stored prefill plan
 * the entries it generated from today on are removed first (logged and edited
 * entries are kept, see deleteExerciseEntriesByTemplateId); prompt and
 * sequential plans never generate entries, so nothing is removed. If the
 * updated plan is an active weekly prefill plan, its entries are regenerated.
 *
 * @param userId - Owner of the template.
 * @param templateId - Template to update.
 * @param updateData - Changed fields, assignments and the client's current date.
 * @returns The updated plan.
 */
async function updateWorkoutPlanTemplate(
  userId: string,
  templateId: string | number,
  updateData: UpdateWorkoutPlanTemplateInput
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
  if (!ownerId) {
    throw new Error('Workout plan template not found.');
  }
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
  if (!existingPlan) {
    throw new Error('Workout plan template not found.');
  }
  if (
    updateData.schedule_type &&
    existingPlan.schedule_type &&
    updateData.schedule_type !== existingPlan.schedule_type &&
    !updateData.assignments
  ) {
    throw new Error(
      'Changing schedule_type requires providing updated assignments.'
    );
  }
  const mergedUpdateData = {
    ...existingPlan,
    ...updateData,
    assignments: updateData.assignments ?? existingPlan?.assignments,
    focus_sessions: updateData.focus_sessions ?? existingPlan?.focus_sessions,
  };
  const planMode = normalizePlanMode(mergedUpdateData);
  const scheduleType =
    planMode === 'training_focus'
      ? 'weekly'
      : (mergedUpdateData.schedule_type ?? 'sequential');
  const entryMode =
    scheduleType === 'sequential'
      ? 'prompt'
      : (mergedUpdateData.entry_mode ?? 'prompt');
  const focusSessions =
    planMode === 'training_focus'
      ? normalizeTrainingFocusSessions(mergedUpdateData.focus_sessions)
      : [];

  // Validate assignments if they are being updated
  if (planMode === 'detailed' && mergedUpdateData.assignments) {
    await validateAndNormalizeAssignments(
      mergedUpdateData.assignments,
      scheduleType,
      userId
    );
  }
  try {
    const today = await resolveTemplateStartDay(
      userId,
      updateData.currentClientDate
    );
    // When a prefill plan is updated, remove the entries it generated so they
    // can be regenerated. A prompt or sequential plan never generates entries;
    // every row linked to it was logged by the user, so there is nothing to
    // remove.
    const storedPlanGeneratesEntries =
      existingPlan.schedule_type !== 'sequential' &&
      existingPlan.entry_mode !== 'prompt';
    if (storedPlanGeneratesEntries) {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Deleting generated exercise entries for template ${templateId}`
      );
      await exerciseRepository.deleteExerciseEntriesByTemplateId(
        templateId,
        userId,
        today
      );
    } else {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Template ${templateId} does not generate entries (prompt or sequential), nothing to delete`
      );
    }
    const shouldUnlinkHistoricalEntries =
      existingPlan.schedule_type === 'weekly' && scheduleType === 'sequential';
    if (shouldUnlinkHistoricalEntries) {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Unlinking historical exercise entries for template ${templateId} on transition to sequential`
      );
    }
    const updatedPlan =
      await workoutPlanTemplateRepository.updateWorkoutPlanTemplate(
        templateId,
        userId,
        {
          ...mergedUpdateData,
          plan_mode: planMode,
          schedule_type: scheduleType,
          entry_mode: entryMode,
          focus_sessions: focusSessions,
          assignments:
            planMode === 'training_focus' ? [] : mergedUpdateData.assignments,
        },
        shouldUnlinkHistoricalEntries
      );
    log(
      'info',
      'updateWorkoutPlanTemplate service - updatedPlan:',
      updatedPlan
    );
    if (
      updatedPlan.is_active &&
      updatedPlan.plan_mode !== 'training_focus' &&
      updatedPlan.schedule_type === 'weekly' &&
      updatedPlan.entry_mode === 'prefill'
    ) {
      log(
        'info',
        `updateWorkoutPlanTemplate service - Updated plan is active, weekly, and prefill, creating exercise entries from template ${updatedPlan.id}`
      );
      await exerciseRepository.createExerciseEntriesFromTemplate(
        updatedPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        'updateWorkoutPlanTemplate service - Skipping exercise entry creation (inactive, sequential, or prompt mode).'
      );
    }
    return updatedPlan;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error updating workout plan template ${templateId} for user ${userId}: ${message}`,
      error
    );
    throw new Error('Failed to update workout plan template.', {
      cause: error,
    });
  }
}

async function deleteWorkoutPlanTemplate(
  userId: string,
  templateId: string | number
) {
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
    const message = error instanceof Error ? error.message : String(error);
    log(
      'error',
      `Error deleting workout plan template ${templateId} for user ${userId}: ${message}`,
      error
    );
    throw new Error('Failed to delete workout plan template.', {
      cause: error,
    });
  }
}

async function getActiveWorkoutPlanForDate(userId: string, date: string) {
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
