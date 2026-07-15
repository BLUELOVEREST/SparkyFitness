import React from 'react';
import { render } from '@testing-library/react-native';
import KitchenScreen from '../../src/screens/KitchenScreen';
import { useActiveMealPlanDay } from '../../src/hooks/useActiveMealPlanDay';

jest.mock('../../src/hooks/useActiveMealPlanDay', () => ({
  useActiveMealPlanDay: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: () => '#2563EB',
}));

const mockUseActiveMealPlanDay =
  useActiveMealPlanDay as jest.MockedFunction<typeof useActiveMealPlanDay>;

describe('KitchenScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
              { id: 'egg', type: 'food', name: '鸡蛋', amountLabel: '2 个' },
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
    expect(screen.getByText('鸡蛋')).toBeTruthy();
    expect(screen.getByText('2 个')).toBeTruthy();
  });
});
