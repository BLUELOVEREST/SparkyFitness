import mealPlanTemplateRepository from '../models/mealPlanTemplateRepository.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryService from './foodEntryService.js';
import { log } from '../config/logging.js';
import { resolveTemplateStartDay } from '../utils/timezoneLoader.js';
import { getClient } from '../db/poolManager.js';
import { dayOfWeek } from '@workspace/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasCarbCycleMacroTargets(planData: any) {
  const targets = planData?.macro_targets;
  return (
    targets &&
    typeof targets === 'object' &&
    Object.values(targets).some(
      (dayTargets) => Array.isArray(dayTargets) && dayTargets.length > 0
    )
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMealPlanTemplate(userId: any, planData: any) {
  log('info', 'createMealPlanTemplate service - received planData:', planData);
  try {
    if (planData.is_active) {
      log(
        'info',
        `createMealPlanTemplate service - Deactivating all other meal plan templates for user ${userId}`
      );
      await mealPlanTemplateRepository.deactivateAllMealPlanTemplates(userId);
    }
    const newPlan = await mealPlanTemplateRepository.createMealPlanTemplate({
      ...planData,
      user_id: userId,
    });
    log('info', 'createMealPlanTemplate service - newPlan created:', newPlan);
    if (newPlan.is_active && !hasCarbCycleMacroTargets(newPlan)) {
      log(
        'info',
        `createMealPlanTemplate service - New plan is active, creating food entries from template ${newPlan.id}`
      );
      const today = await resolveTemplateStartDay(
        userId,
        planData.currentClientDate
      );
      await foodRepository.createFoodEntriesFromTemplate(
        newPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        newPlan.is_active
          ? 'createMealPlanTemplate service - Carb cycle plan is active; skipping automatic diary entry creation.'
          : 'createMealPlanTemplate service - New plan is not active, skipping food entry creation.'
      );
    }
    return newPlan;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error creating meal plan template for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to create meal plan template.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanTemplates(userId: any) {
  try {
    const templates =
      await mealPlanTemplateRepository.getMealPlanTemplatesByUserId(userId);
    const templatesWithAssignments = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      templates.map(async (template: any) => {
        const assignments =
          await mealPlanTemplateRepository.getMealPlanTemplateAssignments(
            template.id,
            userId
          );
        return { ...template, assignments };
      })
    );
    return templatesWithAssignments;
  } catch (error) {
    log(
      'error',
      `Error fetching meal plan templates for user ${userId}:`,
      error
    );
    throw new Error('Failed to fetch meal plan templates.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMealPlanTemplate(planId: any, userId: any, planData: any) {
  log(
    'info',
    `updateMealPlanTemplate service - received planData for plan ${planId}:`,
    planData
  );
  try {
    const today = await resolveTemplateStartDay(
      userId,
      planData.currentClientDate
    );
    // When a plan is updated, remove the old food entries that were created from it.
    // The new entries will be generated on-the-fly when the diary is viewed.
    log(
      'info',
      `updateMealPlanTemplate service - Deleting old food entries for template ${planId}`
    );
    await foodRepository.deleteFoodEntriesByTemplateId(planId, userId, today);
    if (planData.is_active) {
      log(
        'info',
        `updateMealPlanTemplate service - Deactivating all other meal plan templates for user ${userId}`
      );
      await mealPlanTemplateRepository.deactivateAllMealPlanTemplates(userId);
    }
    const updatedPlan = await mealPlanTemplateRepository.updateMealPlanTemplate(
      planId,
      { ...planData, user_id: userId }
    );
    log('info', 'updateMealPlanTemplate service - updatedPlan:', updatedPlan);
    if (updatedPlan.is_active && !hasCarbCycleMacroTargets(updatedPlan)) {
      log(
        'info',
        `updateMealPlanTemplate service - Updated plan is active, creating food entries from template ${updatedPlan.id}`
      );
      await foodRepository.createFoodEntriesFromTemplate(
        updatedPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        updatedPlan.is_active
          ? 'updateMealPlanTemplate service - Carb cycle plan is active; skipping automatic diary entry creation.'
          : 'updateMealPlanTemplate service - Updated plan is not active, skipping food entry creation.'
      );
    }
    return updatedPlan;
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error updating meal plan template ${planId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to update meal plan template.', { cause: error });
  }
}

async function deleteMealPlanTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  planId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentClientDate: any
) {
  try {
    const today = await resolveTemplateStartDay(userId, currentClientDate);
    log(
      'info',
      `deleteMealPlanTemplate service - Deleting food entries for template ${planId} starting from ${today}`
    );
    await foodRepository.deleteFoodEntriesByTemplateId(planId, userId, today);
    return await mealPlanTemplateRepository.deleteMealPlanTemplate(
      planId,
      userId
    );
  } catch (error) {
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error deleting meal plan template ${planId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to delete meal plan template.', { cause: error });
  }
}

function normalizeMealType(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function formatAmount(quantity: number, unit: string) {
  const roundedQuantity = Number.isInteger(quantity)
    ? quantity
    : Number(quantity.toFixed(1));
  return `${roundedQuantity}${unit}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMacroTargets(rawTargets: any): Record<number, any[]> {
  if (!rawTargets || typeof rawTargets !== 'object') return {};
  return Object.entries(rawTargets).reduce<Record<number, any[]>>(
    (acc, [dayIndex, meals]) => {
      const parsedDayIndex = Number(dayIndex);
      if (Number.isFinite(parsedDayIndex)) {
        acc[parsedDayIndex] = Array.isArray(meals) ? meals : [];
      }
      return acc;
    },
    {}
  );
}

async function hasLoggedPlannedMeal(
  userId: string,
  templateId: string,
  date: string,
  mealTypeId: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `
        SELECT fem.id
        FROM food_entry_meals fem
        WHERE fem.user_id = $1
          AND fem.entry_date = $2
          AND fem.meal_type_id = $3
          AND EXISTS (
            SELECT 1
            FROM food_entries fe
            WHERE fe.food_entry_meal_id = fem.id
              AND fe.meal_plan_template_id = $4
          )
        LIMIT 1
      `,
      [userId, date, mealTypeId, templateId]
    );
    return result.rows[0]?.id ?? null;
  } finally {
    client.release();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assignmentName(assignment: any) {
  return assignment.item_type === 'meal'
    ? assignment.meal_name || 'Meal'
    : assignment.food_name || 'Food';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assignmentToPlannedItem(assignment: any, fallbackIndex: number) {
  const quantity = Number(assignment.quantity ?? 1);
  const unit = assignment.unit || 'serving';
  return {
    id:
      assignment.item_type === 'meal'
        ? assignment.meal_id || `meal-${fallbackIndex}`
        : assignment.food_id || `food-${fallbackIndex}`,
    type: assignment.item_type,
    name: assignmentName(assignment),
    quantity,
    unit,
    amountLabel: formatAmount(quantity, unit),
    macroRole: assignment.macro_role ?? null,
    foodId: assignment.food_id ?? null,
    mealId: assignment.meal_id ?? null,
    variantId: assignment.variant_id ?? null,
  };
}

async function getActiveMealPlanDay(userId: string, date: string) {
  const template = await mealPlanTemplateRepository.getActiveMealPlanForDate(
    userId,
    date
  );

  if (!template) {
    return {
      mode: 'average',
      date,
      templateId: null,
      planName: null,
      meals: [],
    };
  }

  const targetsByDay = normalizeMacroTargets(template.macro_targets);
  const currentDayIndex = dayOfWeek(date);
  const mealTargets = targetsByDay[currentDayIndex] ?? [];

  if (mealTargets.length === 0) {
    return {
      mode: 'average',
      date,
      templateId: template.id,
      planName: template.plan_name,
      meals: [],
    };
  }

  const assignments =
    await mealPlanTemplateRepository.getMealPlanTemplateAssignments(
      template.id,
      userId
    );
  const dayAssignments = assignments.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (assignment: any) => assignment.day_of_week === currentDayIndex
  );

  const meals = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mealTargets.map(async (target: any, mealIndex: number) => {
      const items = dayAssignments
        .filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (assignment: any) =>
            normalizeMealType(assignment.meal_type) ===
            normalizeMealType(target.label)
        )
        .map((assignment: any, assignmentIndex: number) =>
          assignmentToPlannedItem(
            assignment,
            mealIndex * 1000 + assignmentIndex
          )
        );
      const mealTypeId =
        dayAssignments.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (assignment: any) =>
            normalizeMealType(assignment.meal_type) ===
            normalizeMealType(target.label)
        )?.meal_type_id ?? null;
      const loggedFoodEntryMealId = mealTypeId
        ? await hasLoggedPlannedMeal(userId, template.id, date, mealTypeId)
        : null;

      return {
        key: `${currentDayIndex}-${target.slotKey}-${target.label}`,
        mealTypeId,
        mealType: target.label,
        label: target.label,
        target,
        items,
        logged: Boolean(loggedFoodEntryMealId),
        loggedFoodEntryMealId,
      };
    })
  );

  return {
    mode: 'carbCycle',
    date,
    templateId: template.id,
    planName: template.plan_name,
    meals,
  };
}

async function logActiveMealPlanMealToDiary(
  userId: string,
  date: string,
  mealTypeId: string
) {
  const dayView = await getActiveMealPlanDay(userId, date);
  if (dayView.mode !== 'carbCycle' || !dayView.templateId) {
    throw new Error('No active carb cycle meal plan found for this date.');
  }

  const meal = dayView.meals.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (candidate: any) => candidate.mealTypeId === mealTypeId
  );
  if (!meal) {
    throw new Error('No planned meal found for this meal type.');
  }
  if (meal.items.length === 0) {
    throw new Error('No planned foods found for this meal.');
  }
  if (meal.logged) {
    throw new Error('This planned meal has already been logged.');
  }

  const foods = meal.items.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any) =>
      item.type === 'meal'
        ? {
            item_type: 'meal',
            child_meal_id: item.mealId,
            quantity: item.quantity,
            unit: item.unit,
          }
        : {
            item_type: 'food',
            food_id: item.foodId,
            variant_id: item.variantId,
            quantity: item.quantity,
            unit: item.unit,
          }
  );

  const foodEntryMeal = await foodEntryService.createFoodEntryMeal(
    userId,
    userId,
    {
      user_id: userId,
      meal_type_id: mealTypeId,
      meal_type: meal.label,
      entry_date: date,
      name: `Planned ${meal.label}`,
      description: `Logged from meal plan: ${dayView.planName}`,
      quantity: 1,
      unit: 'serving',
      foods,
      _clientMealModelVersion: 2,
      meal_plan_template_id: dayView.templateId,
    }
  );

  return foodEntryMeal;
}
export { createMealPlanTemplate };
export { getMealPlanTemplates };
export { updateMealPlanTemplate };
export { deleteMealPlanTemplate };
export { getActiveMealPlanDay };
export { logActiveMealPlanMealToDiary };
export default {
  createMealPlanTemplate,
  getMealPlanTemplates,
  updateMealPlanTemplate,
  deleteMealPlanTemplate,
  getActiveMealPlanDay,
  logActiveMealPlanMealToDiary,
};
