import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlansManager from '@/pages/Exercises/WorkoutPlansManager';
import { renderWithClient } from '@/tests/test-utils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (
        defaultValueOrOpts &&
        typeof defaultValueOrOpts === 'object' &&
        'defaultValue' in defaultValueOrOpts
      ) {
        return defaultValueOrOpts['defaultValue'] as string;
      }
      return key;
    },
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'debug', firstDayOfWeek: 1 }),
}));

jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/hooks/Exercises/useWorkoutPlans', () => ({
  useWorkoutPlanTemplates: () => ({
    data: [
      {
        id: 'plan-1',
        user_id: 'user-1',
        plan_name: 'Strength week',
        description: 'Weekly training',
        plan_mode: 'training_focus',
        start_date: '2026-08-17',
        end_date: '2026-08-23',
        is_active: true,
        focus_sessions: [
          {
            day_of_week: 1,
            time_slot: 'morning',
            training_focus: 'rest',
            is_primary: false,
          },
          {
            day_of_week: 1,
            time_slot: 'evening',
            training_focus: 'rest',
            is_primary: false,
          },
          {
            day_of_week: 2,
            time_slot: 'morning',
            training_focus: 'Chest',
            is_primary: true,
          },
          {
            day_of_week: 2,
            time_slot: 'noon',
            training_focus: 'rest',
            is_primary: false,
          },
          {
            day_of_week: 2,
            time_slot: 'evening',
            training_focus: 'Football',
            is_primary: false,
          },
          {
            day_of_week: 0,
            time_slot: 'evening',
            training_focus: 'Football',
            is_primary: true,
          },
        ],
      },
    ],
  }),
  useCreateWorkoutPlanTemplateMutation: () => ({ mutateAsync: jest.fn() }),
  useUpdateWorkoutPlanTemplateMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteWorkoutPlanTemplateMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/pages/Exercises/AddWorkoutPlanDialog', () => {
  return function MockAddWorkoutPlanDialog() {
    return <div data-testid="workout-plan-dialog" />;
  };
});

describe('WorkoutPlansManager', () => {
  it('shows workout plan details grouped by configured week order without listing rest days', async () => {
    renderWithClient(<WorkoutPlansManager />);

    const planTitles = await screen.findAllByText('Strength week');
    const planTitle = planTitles[0];
    if (!planTitle) {
      throw new Error('Expected workout plan title to render');
    }
    fireEvent.click(planTitle);

    await screen.findByTestId('workout-plan-day-2');
    const monday = screen.queryByTestId('workout-plan-day-1');
    const tuesday = screen.getByTestId('workout-plan-day-2');
    const sunday = screen.getByTestId('workout-plan-day-0');

    expect(tuesday.compareDocumentPosition(sunday)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(monday).not.toBeInTheDocument();
    expect(screen.queryByText('Rest')).not.toBeInTheDocument();
    expect(tuesday).toHaveTextContent('Morning');
    expect(tuesday).toHaveTextContent('Chest');
    expect(tuesday).toHaveTextContent('Evening');
    expect(tuesday).toHaveTextContent('Football');
    expect(
      screen.getByTestId('workout-main-session-plan-1-2-morning')
    ).toHaveTextContent('Chest');
    expect(
      screen.getByTestId('workout-main-session-plan-1-2-morning')
    ).toHaveClass('bg-primary/10');
    expect(
      screen.getByTestId('workout-main-session-plan-1-2-morning')
    ).toHaveClass('dark:bg-white');
    expect(
      screen.getByTestId('workout-main-session-plan-1-2-morning')
    ).toHaveClass('text-primary');
    expect(sunday).toHaveTextContent('Evening');
    expect(sunday).toHaveTextContent('Football');
  });
});
