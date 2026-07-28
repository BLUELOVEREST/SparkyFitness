import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FoodSummary from '../../src/components/FoodSummary';
import { usePreferences } from '../../src/hooks/usePreferences';
import type { ActiveMealPlanDayMeal } from '../../src/types/mealPlan';

jest.mock('uniwind', () => ({
  useCSSVariable: () => '#2563EB',
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
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
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;

describe('FoodSummary planned meals', () => {
  beforeEach(() => {
    mockUsePreferences.mockReturnValue({
      preferences: { language: 'en' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

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

  it('labels logged entries with the planned dynamic meal name', () => {
    const { getByText, queryByText } = render(
      <FoodSummary
        plannedMeals={[{ ...plannedMeal, logged: true }]}
        foodEntries={[
          {
            id: 'entry-rice',
            food_id: 'food-rice',
            meal_type: 'Pre-Workout',
            meal_type_id: 'meal-type-pre-workout',
            quantity: 180,
            unit: 'g',
            food_name: '米饭',
            entry_date: '2026-07-15',
            serving_size: 100,
            calories: 130,
            protein: 2,
            carbs: 28,
            fat: 0,
          },
        ]}
      />,
    );

    expect(getByText('Target: C 60g / P 30g / F 5g')).toBeTruthy();
    expect(queryByText('Other')).toBeNull();
    expect(queryByText('Logged from Plan')).toBeNull();
  });

  it('disables logging for already logged planned meals without matching entries', () => {
    const onLogPlannedMeal = jest.fn();
    const { getByText } = render(
      <FoodSummary
        plannedMeals={[{ ...plannedMeal, logged: true }]}
        foodEntries={[]}
        onLogPlannedMeal={onLogPlannedMeal}
      />,
    );

    fireEvent.press(getByText('Logged from Plan'));

    expect(onLogPlannedMeal).not.toHaveBeenCalled();
  });

  it('uses Simplified Chinese labels for planned meal actions', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { language: 'zh-CN' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const { getByText } = render(
      <FoodSummary
        plannedMeals={[plannedMeal]}
        foodEntries={[]}
        onLogPlannedMeal={jest.fn()}
      />,
    );

    expect(getByText('目标: C 60g / P 30g / F 5g')).toBeTruthy();
    expect(getByText('按计划记录')).toBeTruthy();
  });
});
