import {
  buildKitchenIngredientSummary,
  buildKitchenWeeklyIngredientSummary,
} from '../../src/utils/kitchenPlanSummary';
import type { ActiveMealPlanDayMeal } from '../../src/types/mealPlan';

const meals: ActiveMealPlanDayMeal[] = [
  {
    key: 'breakfast',
    mealTypeId: 'meal-type-breakfast',
    label: 'Breakfast',
    logged: false,
    target: { calories: 300, carbs: 30, protein: 25, fat: 8 },
    items: [
      {
        id: 'egg',
        type: 'food',
        name: '鸡蛋',
        quantity: 100,
        unit: 'g',
        amountLabel: '100 g',
      },
      {
        id: 'rice',
        type: 'food',
        name: '米饭',
        quantity: 150,
        unit: 'g',
        amountLabel: '150 g',
      },
    ],
  },
  {
    key: 'post-workout',
    mealTypeId: 'meal-type-post-workout',
    label: 'Post-Workout',
    logged: false,
    target: { calories: 420, carbs: 60, protein: 30, fat: 5 },
    items: [
      {
        id: 'egg',
        type: 'food',
        name: '鸡蛋',
        quantity: 50,
        unit: 'g',
        amountLabel: '50 g',
      },
      {
        id: 'banana',
        type: 'food',
        name: '香蕉',
        amountLabel: '1 根',
      },
    ],
  },
];

describe('buildKitchenIngredientSummary', () => {
  it('combines same ingredients with the same unit across planned meals', () => {
    expect(buildKitchenIngredientSummary(meals)).toEqual([
      {
        key: '鸡蛋|g',
        name: '鸡蛋',
        amountLabel: '150 g',
        mealLabels: ['Breakfast', 'Post-Workout'],
      },
      {
        key: '米饭|g',
        name: '米饭',
        amountLabel: '150 g',
        mealLabels: ['Breakfast'],
      },
      {
        key: '香蕉|1 根',
        name: '香蕉',
        amountLabel: '1 根',
        mealLabels: ['Post-Workout'],
      },
    ]);
  });
});

describe('buildKitchenWeeklyIngredientSummary', () => {
  it('combines ingredients across every carb-cycle day in the week', () => {
    expect(
      buildKitchenWeeklyIngredientSummary([
        {
          mode: 'carbCycle',
          date: '2026-07-15',
          templateId: 'template-1',
          planName: 'Weekly Carb Cycle',
          meals,
        },
        {
          mode: 'carbCycle',
          date: '2026-07-16',
          templateId: 'template-1',
          planName: 'Weekly Carb Cycle',
          meals: [
            {
              key: 'dinner',
              mealTypeId: 'meal-type-dinner',
              label: 'Dinner',
              logged: false,
              target: { calories: 500, carbs: 40, protein: 35, fat: 12 },
              items: [
                {
                  id: 'egg',
                  type: 'food',
                  name: '鸡蛋',
                  quantity: 75,
                  unit: 'g',
                  amountLabel: '75 g',
                },
              ],
            },
          ],
        },
        {
          mode: 'average',
          date: '2026-07-17',
          meals: [],
        },
      ]),
    ).toEqual([
      {
        key: '鸡蛋|g',
        name: '鸡蛋',
        amountLabel: '225 g',
        mealLabels: ['Wed Breakfast', 'Wed Post-Workout', 'Thu Dinner'],
      },
      {
        key: '米饭|g',
        name: '米饭',
        amountLabel: '150 g',
        mealLabels: ['Wed Breakfast'],
      },
      {
        key: '香蕉|1 根',
        name: '香蕉',
        amountLabel: '1 根',
        mealLabels: ['Wed Post-Workout'],
      },
    ]);
  });
});
