import { isDayString } from '@workspace/shared';
import weeklyGoalPlanRepository, {
  WeeklyGoalPlanOverlapError,
  type WeeklyGoalPlanInput,
} from '../models/weeklyGoalPlanRepository.js';
import { ValidationError } from '../utils/errors.js';
import goalRepository from '../models/goalRepository.js';
import mealMacroTargetRepository from '../models/mealMacroTargetRepository.js';
import { log } from '../config/logging.js';
import {
  calculateCarbCycleWeek,
  type CalculateCarbCycleWeekInput,
} from './carbCyclePlannerService.js';

const EMPTY_GOAL_FIELDS = {
  water_goal_ml: 0,
  saturated_fat: 0,
  polyunsaturated_fat: 0,
  monounsaturated_fat: 0,
  trans_fat: 0,
  cholesterol: 0,
  sodium: 0,
  potassium: 0,
  dietary_fiber: 0,
  sugars: 0,
  vitamin_a: 0,
  vitamin_c: 0,
  calcium: 0,
  iron: 0,
  caffeine_mg: 0,
  water_ml: 0,
  alcohol_g: 0,
  target_exercise_calories_burned: 0,
  target_exercise_duration_minutes: 0,
  protein_percentage: null,
  carbs_percentage: null,
  fat_percentage: null,
  breakfast_percentage: 25,
  lunch_percentage: 25,
  dinner_percentage: 25,
  snacks_percentage: 25,
  custom_meal_percentages: {},
  custom_nutrients: {},
};

function normalizeCarbCycleInput(input: CalculateCarbCycleWeekInput) {
  if (input.template !== undefined) {
    throw new Error('template is not supported by this endpoint');
  }

  return {
    weekStartDate: input.weekStartDate,
    bodyWeightKg: input.bodyWeightKg,
    carbsPerKg: input.carbsPerKg,
    proteinPerKg: input.proteinPerKg,
    fatPerKg: input.fatPerKg,
    trainingSlots: input.trainingSlots,
    trainingSessionsByDay: input.trainingSessionsByDay,
  };
}
/** The plan fields a save uses, checked; dates as 'YYYY-MM-DD'. */
function toPlanInput(planData: Record<string, unknown>): WeeklyGoalPlanInput {
  const startDate = planData.start_date;
  const endDate = planData.end_date ?? null;
  if (typeof startDate !== 'string' || !isDayString(startDate)) {
    throw new ValidationError('A start date is required.');
  }
  if (
    endDate !== null &&
    (typeof endDate !== 'string' || !isDayString(endDate))
  ) {
    throw new ValidationError('The end date is not a valid date.');
  }
  if (endDate !== null && endDate < startDate) {
    throw new ValidationError('The end date cannot be before the start date.');
  }
  return {
    ...planData,
    plan_name: String(planData.plan_name ?? ''),
    start_date: startDate,
    end_date: endDate,
    is_active: planData.is_active === true,
  };
}

async function createWeeklyGoalPlan(
  userId: string,
  planData: Record<string, unknown>
) {
  const plan = toPlanInput(planData);
  try {
    return await weeklyGoalPlanRepository.saveWeeklyGoalPlan(
      userId,
      null,
      plan
    );
  } catch (error) {
    if (error instanceof WeeklyGoalPlanOverlapError) throw error;
    log('error', `Error creating weekly goal plan for user ${userId}:`, error);
    throw new Error('Failed to create weekly goal plan.', { cause: error });
  }
}
async function getWeeklyGoalPlans(userId: string) {
  try {
    const plans =
      await weeklyGoalPlanRepository.getWeeklyGoalPlansByUserId(userId);
    return plans;
  } catch (error) {
    log('error', `Error fetching weekly goal plans for user ${userId}:`, error);
    throw new Error('Failed to fetch weekly goal plans.', { cause: error });
  }
}
async function getActiveWeeklyGoalPlan(userId: string, date: string) {
  try {
    const plan = await weeklyGoalPlanRepository.getActiveWeeklyGoalPlan(
      userId,
      date
    );
    return plan;
  } catch (error) {
    log(
      'error',
      `Error fetching active weekly goal plan for user ${userId} on date ${date}:`,
      error
    );
    throw new Error('Failed to fetch active weekly goal plan.', {
      cause: error,
    });
  }
}
async function updateWeeklyGoalPlan(
  planId: string,
  userId: string,
  planData: Record<string, unknown>
) {
  const plan = toPlanInput(planData);
  try {
    return await weeklyGoalPlanRepository.saveWeeklyGoalPlan(
      userId,
      planId,
      plan
    );
  } catch (error) {
    if (error instanceof WeeklyGoalPlanOverlapError) throw error;
    log(
      'error',
      `Error updating weekly goal plan ${planId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to update weekly goal plan.', { cause: error });
  }
}
async function deleteWeeklyGoalPlan(planId: string, userId: string) {
  try {
    const deletedPlan = await weeklyGoalPlanRepository.deleteWeeklyGoalPlan(
      planId,
      userId
    );
    return deletedPlan;
  } catch (error) {
    log(
      'error',
      `Error deleting weekly goal plan ${planId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to delete weekly goal plan.', { cause: error });
  }
}

async function previewCarbCycleWeek(input: CalculateCarbCycleWeekInput) {
  return calculateCarbCycleWeek(normalizeCarbCycleInput(input));
}

async function applyCarbCycleWeek(
  userId: string,
  input: CalculateCarbCycleWeekInput
) {
  const plan = calculateCarbCycleWeek(normalizeCarbCycleInput(input));

  for (const day of plan.days) {
    const existingGoal =
      (await goalRepository.getGoalByDate(userId, day.date)) ??
      (await goalRepository.getMostRecentGoalBeforeDate(userId, day.date));

    await goalRepository.upsertGoal({
      ...EMPTY_GOAL_FIELDS,
      ...existingGoal,
      user_id: userId,
      goal_date: day.date,
      calories: day.calories,
      protein: day.protein,
      carbs: day.carbs,
      fat: day.fat,
    });
  }

  await mealMacroTargetRepository.replaceMealMacroTargetsForWeek(
    userId,
    plan.days[0].date,
    plan.days[plan.days.length - 1].date,
    plan.days.flatMap((day) =>
      day.meals.map((meal) => ({
        goal_date: day.date,
        slot_key: meal.slotKey,
        label: meal.label,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
      }))
    )
  );

  return plan;
}

export { createWeeklyGoalPlan };
export { getWeeklyGoalPlans };
export { getActiveWeeklyGoalPlan };
export { updateWeeklyGoalPlan };
export { deleteWeeklyGoalPlan };
export { previewCarbCycleWeek };
export { applyCarbCycleWeek };
export default {
  createWeeklyGoalPlan,
  getWeeklyGoalPlans,
  getActiveWeeklyGoalPlan,
  updateWeeklyGoalPlan,
  deleteWeeklyGoalPlan,
  previewCarbCycleWeek,
  applyCarbCycleWeek,
};
