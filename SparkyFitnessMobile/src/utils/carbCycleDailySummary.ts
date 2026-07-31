import type { DailySummary } from '../types/dailySummary';
import type { ActiveMealPlanDay } from '../types/mealPlan';

const round = (value: number) => Math.round(value);

export function applyCarbCycleTargetsToDailySummary(
  summary: DailySummary,
  activeMealPlanDay?: ActiveMealPlanDay | null,
): DailySummary {
  if (
    activeMealPlanDay?.mode !== 'carbCycle' ||
    activeMealPlanDay.meals.length === 0
  ) {
    return summary;
  }

  const target = activeMealPlanDay.meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.target.calories,
      carbs: acc.carbs + meal.target.carbs,
      protein: acc.protein + meal.target.protein,
      fat: acc.fat + meal.target.fat,
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 },
  );

  const calorieGoal = target.calories;
  const remaining = calorieGoal - summary.calorieBalance.eaten;
  const progress = calorieGoal > 0
    ? Math.max(0, round((summary.calorieBalance.eaten / calorieGoal) * 100))
    : 0;

  return {
    ...summary,
    calorieGoal,
    remainingCalories: calorieGoal - summary.netCalories,
    protein: { ...summary.protein, goal: target.protein },
    carbs: { ...summary.carbs, goal: target.carbs },
    fat: { ...summary.fat, goal: target.fat },
    goals: {
      ...summary.goals,
      calories: calorieGoal,
      protein: target.protein,
      carbs: target.carbs,
      fat: target.fat,
    },
    calorieBalance: {
      ...summary.calorieBalance,
      goal: round(calorieGoal),
      remaining: round(remaining),
      progress,
    },
  };
}
