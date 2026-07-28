import { buildKitchenIngredientSummary } from '../../src/utils/kitchenPlanSummary';
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
