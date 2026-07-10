import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import goalRepository from '../models/goalRepository.js';
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
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWeeklyGoalPlan(userId: any, planData: any) {
  try {
    // Deactivate all other active plans for this user if the new plan is active
    if (planData.is_active) {
      await weeklyGoalPlanRepository.deactivateAllWeeklyGoalPlans(userId);
    }
    const newPlan = await weeklyGoalPlanRepository.createWeeklyGoalPlan({
      ...planData,
      user_id: userId,
    });
    return newPlan;
  } catch (error) {
    log('error', `Error creating weekly goal plan for user ${userId}:`, error);
    throw new Error('Failed to create weekly goal plan.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWeeklyGoalPlans(userId: any) {
  try {
    const plans =
      await weeklyGoalPlanRepository.getWeeklyGoalPlansByUserId(userId);
    return plans;
  } catch (error) {
    log('error', `Error fetching weekly goal plans for user ${userId}:`, error);
    throw new Error('Failed to fetch weekly goal plans.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveWeeklyGoalPlan(userId: any, date: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateWeeklyGoalPlan(planId: any, userId: any, planData: any) {
  try {
    // Deactivate all other active plans for this user if this plan is being set to active
    if (planData.is_active) {
      await weeklyGoalPlanRepository.deactivateAllWeeklyGoalPlans(userId);
    }
    const updatedPlan = await weeklyGoalPlanRepository.updateWeeklyGoalPlan(
      planId,
      { ...planData, user_id: userId }
    );
    return updatedPlan;
  } catch (error) {
    log(
      'error',
      `Error updating weekly goal plan ${planId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to update weekly goal plan.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWeeklyGoalPlan(planId: any, userId: any) {
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
