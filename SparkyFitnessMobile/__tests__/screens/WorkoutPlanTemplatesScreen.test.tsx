import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import WorkoutPlanTemplatesScreen from '../../src/screens/WorkoutPlanTemplatesScreen';
import { useWorkoutPlanTemplates } from '../../src/hooks/useWorkoutPlanTemplates';

jest.mock('../../src/hooks/useWorkoutPlanTemplates', () => ({
  useWorkoutPlanTemplates: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseWorkoutPlanTemplates =
  useWorkoutPlanTemplates as jest.MockedFunction<typeof useWorkoutPlanTemplates>;

describe('WorkoutPlanTemplatesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders saved training focus workout plans', () => {
    const navigation = { navigate: jest.fn() };
    mockUseWorkoutPlanTemplates.mockReturnValue({
      templates: [
        {
          id: 'workout-plan-1',
          plan_name: 'Training Focus',
          description: 'Body-part only plan',
          start_date: '2026-07-13',
          end_date: null,
          is_active: true,
          plan_mode: 'training_focus',
          assignments: [],
          focus_sessions: [
            {
              day_of_week: 1,
              time_slot: 'morning',
              training_focus: 'back',
              is_primary: true,
            },
          ],
        },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = render(
      <WorkoutPlanTemplatesScreen
        navigation={navigation as never}
        route={{} as never}
      />,
    );

    expect(screen.getByText('Training Focus')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('1 training session')).toBeTruthy();

    fireEvent.press(screen.getByText('Training Focus'));

    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPlanTemplateForm', {
      mode: 'edit',
      template: expect.objectContaining({ id: 'workout-plan-1' }),
    });
  });

  it('navigates to create a new workout plan', () => {
    const navigation = { navigate: jest.fn() };
    mockUseWorkoutPlanTemplates.mockReturnValue({
      templates: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = render(
      <WorkoutPlanTemplatesScreen
        navigation={navigation as never}
        route={{} as never}
      />,
    );

    fireEvent.press(screen.getByText('New'));

    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPlanTemplateForm', {
      mode: 'create',
    });
  });
});
