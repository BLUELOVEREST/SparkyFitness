import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FoodSummary from '../../src/components/FoodSummary';
import type { ActiveMealPlanDayMeal } from '../../src/types/mealPlan';

jest.mock('uniwind', () => ({
  useCSSVariable: () => '#2563EB',
}));

jest.mock('../../src/components/SwipeableFoodRow', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ entry }: { entry: { food_name?: string } }) => (
      <Text>{entry.food_name ?? 'Food row'}</Text>
    ),
  };
});

const plannedMeal: ActiveMealPlanDayMeal = {
  mealTypeId: 'meal-type-pre-workout',
  key: 'pre-workout',
  label: 'Pre-Workout',
  target: {
    calories: 420,
    carbs: 60,
    protein: 30,
    fat: 5,
  },
  items: [
    {
      id: 'food-rice',
      type: 'food',
      name: '米饭',
      amountLabel: '180 g',
      macroRole: 'carb',
    },
  ],
  logged: false,
};

describe('FoodSummary planned meals', () => {
  it('shows planned meals when diary has no logged food entries', () => {
    const onLogPlannedMeal = jest.fn();
    const { getByText, queryByText } = render(
      <FoodSummary
        foodEntries={[]}
        plannedMeals={[plannedMeal]}
        onLogPlannedMeal={onLogPlannedMeal}
      />,
    );

    expect(queryByText('Tap to add food')).toBeNull();
    expect(getByText('Pre-Workout')).toBeTruthy();
    expect(getByText('米饭')).toBeTruthy();
    expect(getByText('180 g')).toBeTruthy();

    fireEvent.press(getByText('Log from Plan'));
    expect(onLogPlannedMeal).toHaveBeenCalledWith(plannedMeal);
  });
});
