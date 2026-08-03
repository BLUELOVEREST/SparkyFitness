import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import KitchenScreen from '../../src/screens/KitchenScreen';
import { useActiveMealPlanDay } from '../../src/hooks/useActiveMealPlanDay';
import { useActiveMealPlanWeek } from '../../src/hooks/useActiveMealPlanWeek';
import { usePreferences } from '../../src/hooks/usePreferences';

jest.mock('../../src/hooks/useActiveMealPlanDay', () => ({
  useActiveMealPlanDay: jest.fn(),
}));

jest.mock('../../src/hooks/useActiveMealPlanWeek', () => ({
  useActiveMealPlanWeek: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: () => '#2563EB',
}));

jest.mock('../../src/utils/dateUtils', () => {
  const actual = jest.requireActual('../../src/utils/dateUtils');
  return {
    ...actual,
    getTodayDate: () => '2026-07-15',
  };
});

const mockUseActiveMealPlanDay =
  useActiveMealPlanDay as jest.MockedFunction<typeof useActiveMealPlanDay>;
const mockUseActiveMealPlanWeek =
  useActiveMealPlanWeek as jest.MockedFunction<typeof useActiveMealPlanWeek>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;

describe('KitchenScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePreferences.mockReturnValue({
      preferences: { language: 'en' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseActiveMealPlanWeek.mockReturnValue({
      activeMealPlanDays: [],
      isLoading: false,
      isError: false,
    });
  });

  it('renders active carb-cycle planned meals', () => {
    mockUseActiveMealPlanDay.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      activeMealPlanDay: {
        mode: 'carbCycle',
        date: '2026-07-15',
        planName: 'Weekly Carb Cycle',
        meals: [
          {
            key: 'breakfast',
            mealTypeId: 'meal-type-1',
            mealType: 'breakfast',
            label: 'Breakfast',
            logged: false,
            target: { calories: 300, carbs: 30, protein: 25, fat: 8 },
            items: [
              { id: 'egg', type: 'food', name: '鸡蛋', quantity: 100, unit: 'g', amountLabel: '100 g' },
            ],
          },
          {
            key: 'lunch',
            mealTypeId: 'meal-type-2',
            mealType: 'lunch',
            label: 'Lunch',
            logged: false,
            target: { calories: 400, carbs: 50, protein: 30, fat: 10 },
            items: [
              { id: 'egg', type: 'food', name: '鸡蛋', quantity: 50, unit: 'g', amountLabel: '50 g' },
            ],
          },
        ],
      },
    });

    const screen = render(
      <KitchenScreen navigation={{} as never} route={{} as never} />,
    );

    expect(screen.getByText('Weekly Carb Cycle')).toBeTruthy();
    expect(screen.getByText('Breakfast')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy();
    expect(screen.getByText('Ingredient Summary')).toBeTruthy();
    expect(screen.getAllByText('鸡蛋').length).toBeGreaterThan(0);
    expect(screen.getByText('150 g')).toBeTruthy();
    expect(screen.getByText('Breakfast · Lunch')).toBeTruthy();
  });

  it('renders a weekly ingredient summary from the active meal plan week', () => {
    mockUseActiveMealPlanDay.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      activeMealPlanDay: {
        mode: 'carbCycle',
        date: '2026-07-15',
        planName: 'Weekly Carb Cycle',
        meals: [],
      },
    });
    mockUseActiveMealPlanWeek.mockReturnValue({
      isLoading: false,
      isError: false,
      activeMealPlanDays: [
        {
          mode: 'carbCycle',
          date: '2026-07-15',
          planName: 'Weekly Carb Cycle',
          meals: [
            {
              key: 'breakfast',
              mealTypeId: 'meal-type-1',
              mealType: 'breakfast',
              label: 'Breakfast',
              logged: false,
              target: { calories: 300, carbs: 30, protein: 25, fat: 8 },
              items: [
                { id: 'rice', type: 'food', name: '米饭', quantity: 150, unit: 'g', amountLabel: '150 g' },
              ],
            },
          ],
        },
        {
          mode: 'carbCycle',
          date: '2026-07-16',
          planName: 'Weekly Carb Cycle',
          meals: [
            {
              key: 'dinner',
              mealTypeId: 'meal-type-2',
              mealType: 'dinner',
              label: 'Dinner',
              logged: false,
              target: { calories: 400, carbs: 50, protein: 30, fat: 10 },
              items: [
                { id: 'rice', type: 'food', name: '米饭', quantity: 200, unit: 'g', amountLabel: '200 g' },
              ],
            },
          ],
        },
      ],
    });

    const screen = render(
      <KitchenScreen navigation={{} as never} route={{} as never} />,
    );

    expect(screen.getByText('Weekly Prep')).toBeTruthy();
    expect(screen.getByText('350 g')).toBeTruthy();
    expect(screen.getByText('Wed Breakfast · Thu Dinner')).toBeTruthy();
  });

  it('does not keep the today accent border after another date is selected', () => {
    mockUseActiveMealPlanDay.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      activeMealPlanDay: {
        mode: 'carbCycle',
        date: '2026-07-15',
        planName: 'Weekly Carb Cycle',
        meals: [],
      },
    });

    const screen = render(
      <KitchenScreen navigation={{} as never} route={{} as never} />,
    );

    fireEvent.press(screen.getByTestId('kitchen-week-day-2026-07-16'));

    expect(screen.getByTestId('kitchen-week-day-2026-07-15').props.className).not.toContain(
      'border-accent-primary',
    );
  });

  it('lets the user switch to another day in the current week', () => {
    mockUseActiveMealPlanDay.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      activeMealPlanDay: {
        mode: 'carbCycle',
        date: '2026-07-15',
        planName: 'Weekly Carb Cycle',
        meals: [],
      },
    });

    const screen = render(
      <KitchenScreen navigation={{} as never} route={{} as never} />,
    );

    expect(mockUseActiveMealPlanDay).toHaveBeenLastCalledWith({
      date: '2026-07-15',
    });

    fireEvent.press(screen.getByText('Thu'));

    expect(mockUseActiveMealPlanDay).toHaveBeenLastCalledWith({
      date: '2026-07-16',
    });
  });

  it('uses Simplified Chinese labels for kitchen text', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { language: 'zh-CN' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseActiveMealPlanDay.mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
      activeMealPlanDay: {
        mode: 'carbCycle',
        date: '2026-07-15',
        planName: null,
        meals: [],
      },
    });

    const screen = render(
      <KitchenScreen navigation={{} as never} route={{} as never} />,
    );

    expect(screen.getByText('厨房')).toBeTruthy();
    expect(screen.getByText('没有计划餐')).toBeTruthy();
  });
});
