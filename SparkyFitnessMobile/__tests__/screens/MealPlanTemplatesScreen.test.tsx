import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MealPlanTemplatesScreen from '../../src/screens/MealPlanTemplatesScreen';
import { useMealPlanTemplates } from '../../src/hooks/useMealPlanTemplates';

jest.mock('../../src/hooks/useMealPlanTemplates', () => ({
  useMealPlanTemplates: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseMealPlanTemplates =
  useMealPlanTemplates as jest.MockedFunction<typeof useMealPlanTemplates>;

describe('MealPlanTemplatesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders saved meal plan templates', () => {
    const navigation = { navigate: jest.fn() };
    mockUseMealPlanTemplates.mockReturnValue({
      templates: [
        {
          id: 'template-1',
          plan_name: 'Weekly Carb Cycle',
          description: 'Four-meal carb cycle',
          start_date: '2026-07-13',
          end_date: null,
          is_active: true,
          macro_targets: {},
          assignments: [
            {
              item_type: 'food',
              day_of_week: 1,
              meal_type: 'breakfast',
              food_id: 'food-1',
              food_name: '鸡蛋',
              macro_role: 'protein',
            },
          ],
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = render(
      <MealPlanTemplatesScreen navigation={navigation as never} route={{} as never} />,
    );

    expect(screen.getByText('Weekly Carb Cycle')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Starts 2026-07-13')).toBeTruthy();
    expect(screen.getByText('1 planned item')).toBeTruthy();

    fireEvent.press(screen.getByText('Weekly Carb Cycle'));

    expect(navigation.navigate).toHaveBeenCalledWith('MealPlanTemplateForm', {
      mode: 'edit',
      template: expect.objectContaining({ id: 'template-1' }),
    });
  });

  it('renders an empty state when no templates exist', () => {
    mockUseMealPlanTemplates.mockReturnValue({
      templates: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = render(
      <MealPlanTemplatesScreen navigation={{} as never} route={{} as never} />,
    );

    expect(screen.getByText('No meal plans yet')).toBeTruthy();
  });
});
