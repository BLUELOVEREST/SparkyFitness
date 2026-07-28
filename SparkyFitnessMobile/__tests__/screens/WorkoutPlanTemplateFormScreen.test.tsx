import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import WorkoutPlanTemplateFormScreen from '../../src/screens/WorkoutPlanTemplateFormScreen';
import {
  useCreateWorkoutPlanTemplate,
  useUpdateWorkoutPlanTemplate,
} from '../../src/hooks/useWorkoutPlanTemplates';
import { usePreferences } from '../../src/hooks/usePreferences';

jest.mock('../../src/hooks/useWorkoutPlanTemplates', () => ({
  useCreateWorkoutPlanTemplate: jest.fn(),
  useUpdateWorkoutPlanTemplate: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseCreateWorkoutPlanTemplate =
  useCreateWorkoutPlanTemplate as jest.MockedFunction<typeof useCreateWorkoutPlanTemplate>;
const mockUseUpdateWorkoutPlanTemplate =
  useUpdateWorkoutPlanTemplate as jest.MockedFunction<typeof useUpdateWorkoutPlanTemplate>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;

describe('WorkoutPlanTemplateFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePreferences.mockReturnValue({
      preferences: { language: 'en' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('creates a training focus plan with an automatically selected main session', async () => {
    const createTemplate = jest.fn();
    mockUseCreateWorkoutPlanTemplate.mockImplementation((options) => ({
      createTemplate: async (payload) => {
        createTemplate(payload);
        const template = { id: 'workout-plan-1', ...payload };
        options?.onSuccess?.(template);
        return template;
      },
      createTemplateSync: jest.fn(),
      isPending: false,
    }));
    mockUseUpdateWorkoutPlanTemplate.mockReturnValue({
      updateTemplate: jest.fn(),
      updateTemplateSync: jest.fn(),
      isPending: false,
    });
    const navigation = { goBack: jest.fn() };

    const screen = render(
      <WorkoutPlanTemplateFormScreen
        navigation={navigation as never}
        route={{ params: { mode: 'create' } } as never}
      />,
    );

    fireEvent.changeText(screen.getByPlaceholderText('Training Focus Plan'), 'My Focus Plan');
    fireEvent.changeText(screen.getByPlaceholderText('Optional'), 'Weekday split');
    fireEvent.press(screen.getAllByText('Monday')[0]);
    fireEvent.press(screen.getByText('Morning'));
    fireEvent.press(screen.getByText('Back'));
    expect(screen.getByText('Weekly Summary')).toBeTruthy();
    expect(screen.getByText('Monday · 1 session · Main: morning')).toBeTruthy();
    fireEvent.press(screen.getByText('Save Workout Plan'));

    await waitFor(() => expect(createTemplate).toHaveBeenCalledTimes(1));
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_name: 'My Focus Plan',
        description: 'Weekday split',
        plan_mode: 'training_focus',
        assignments: [],
        focus_sessions: expect.arrayContaining([
          expect.objectContaining({
            day_of_week: 1,
            time_slot: 'morning',
            training_focus: 'back',
            is_primary: true,
          }),
        ]),
      }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('uses Simplified Chinese labels when the user language is zh-CN', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { language: 'zh-CN' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseCreateWorkoutPlanTemplate.mockReturnValue({
      createTemplate: jest.fn(),
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseUpdateWorkoutPlanTemplate.mockReturnValue({
      updateTemplate: jest.fn(),
      updateTemplateSync: jest.fn(),
      isPending: false,
    });

    const screen = render(
      <WorkoutPlanTemplateFormScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ params: { mode: 'create' } } as never}
      />,
    );

    expect(screen.getByText('新建训练计划')).toBeTruthy();
    expect(screen.getByText('训练重点时段')).toBeTruthy();
    expect(screen.getByText('每周摘要')).toBeTruthy();
    expect(screen.getByText('保存训练计划')).toBeTruthy();
  });

  it('updates an existing training focus plan', async () => {
    const updateTemplate = jest.fn();
    mockUseCreateWorkoutPlanTemplate.mockReturnValue({
      createTemplate: jest.fn(),
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseUpdateWorkoutPlanTemplate.mockImplementation((options) => ({
      updateTemplate: async (payload) => {
        updateTemplate(payload);
        const template = { id: 'workout-plan-1', ...payload };
        options?.onSuccess?.(template);
        return template;
      },
      updateTemplateSync: jest.fn(),
      isPending: false,
    }));
    const navigation = { goBack: jest.fn() };

    const screen = render(
      <WorkoutPlanTemplateFormScreen
        navigation={navigation as never}
        route={{
          params: {
            mode: 'edit',
            template: {
              id: 'workout-plan-1',
              plan_name: 'Existing Focus',
              description: null,
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
          },
        } as never}
      />,
    );

    expect(screen.getByDisplayValue('Existing Focus')).toBeTruthy();
    fireEvent.press(screen.getAllByText('Monday')[0]);
    fireEvent.press(screen.getByText('Morning'));
    fireEvent.press(screen.getByText('Chest'));
    fireEvent.press(screen.getByText('Save Workout Plan'));

    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1));
    expect(updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'workout-plan-1',
        plan_name: 'Existing Focus',
        focus_sessions: expect.arrayContaining([
          expect.objectContaining({
            day_of_week: 1,
            time_slot: 'morning',
            training_focus: 'chest',
            is_primary: true,
          }),
        ]),
      }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
