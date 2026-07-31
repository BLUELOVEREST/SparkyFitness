import { applyCarbCycleTargetsToDailySummary } from '../../src/utils/carbCycleDailySummary';
import type { DailySummary } from '../../src/types/dailySummary';
import type { ActiveMealPlanDay } from '../../src/types/mealPlan';

const baseSummary: DailySummary = {
  date: '2026-07-31',
  calorieGoal: 2480,
  caloriesConsumed: 500,
  caloriesBurned: 200,
  activeCalories: 0,
  otherExerciseCalories: 200,
  netCalories: 300,
  remainingCalories: 2180,
  protein: { consumed: 20, goal: 150 },
  carbs: { consumed: 40, goal: 300 },
  fat: { consumed: 10, goal: 80 },
  fiber: { consumed: 5, goal: 30 },
  stepCalories: 0,
  exerciseMinutes: 30,
  exerciseMinutesGoal: 0,
  exerciseCaloriesGoal: 0,
  waterConsumed: 0,
  waterGoal: 2500,
  foodEntries: [],
  exerciseEntries: [],
  calorieBalance: {
    eaten: 500,
    burned: 200,
    remaining: 1980,
    goal: 2480,
    net: 300,
    progress: 20,
    bmr: 1804,
    bmrSource: 'formula',
    exerciseSource: 'none',
    tdeeProjection: null,
  },
  goals: {
    calories: 2480,
    protein: 150,
    carbs: 300,
    fat: 80,
    water_goal_ml: 2500,
  },
  customNutrientTotals: {},
  customNutrientGoals: {},
};

const carbCycleDay: ActiveMealPlanDay = {
  mode: 'carbCycle',
  date: '2026-07-31',
  meals: [
    {
      key: 'breakfast',
      mealTypeId: 'breakfast-id',
      label: 'Breakfast',
      logged: false,
      target: { calories: 400, carbs: 50, protein: 25, fat: 10 },
      items: [],
    },
    {
      key: 'post-workout',
      mealTypeId: 'post-workout-id',
      label: 'Post-Workout',
      logged: false,
      target: { calories: 600, carbs: 80, protein: 35, fat: 12 },
      items: [],
    },
  ],
};

describe('applyCarbCycleTargetsToDailySummary', () => {
  it('keeps the server daily summary unchanged without a carb-cycle day', () => {
    expect(applyCarbCycleTargetsToDailySummary(baseSummary, null)).toBe(baseSummary);
    expect(
      applyCarbCycleTargetsToDailySummary(baseSummary, {
        ...carbCycleDay,
        mode: 'average',
      }),
    ).toBe(baseSummary);
  });

  it('overrides calorie and macro goals from carb-cycle planned meal targets', () => {
    const result = applyCarbCycleTargetsToDailySummary(baseSummary, carbCycleDay);

    expect(result.calorieGoal).toBe(1000);
    expect(result.calorieBalance.goal).toBe(1000);
    expect(result.calorieBalance.remaining).toBe(500);
    expect(result.calorieBalance.progress).toBe(50);
    expect(result.protein.goal).toBe(60);
    expect(result.carbs.goal).toBe(130);
    expect(result.fat.goal).toBe(22);
    expect(result.goals.calories).toBe(1000);
    expect(result.goals.protein).toBe(60);
    expect(result.goals.carbs).toBe(130);
    expect(result.goals.fat).toBe(22);
  });
});
