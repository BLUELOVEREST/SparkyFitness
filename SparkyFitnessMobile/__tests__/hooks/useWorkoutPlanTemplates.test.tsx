import { act, renderHook, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import {
  createWorkoutPlanTemplate,
  fetchActiveTrainingFocusPlan,
  fetchWorkoutPlanTemplates,
  updateWorkoutPlanTemplate,
} from '../../src/services/api/workoutPlanTemplatesApi';
import {
  useActiveTrainingFocusPlan,
  useCreateWorkoutPlanTemplate,
  useUpdateWorkoutPlanTemplate,
  useWorkoutPlanTemplates,
} from '../../src/hooks/useWorkoutPlanTemplates';
import { workoutPlanTemplatesQueryKey } from '../../src/hooks/queryKeys';
import { createQueryWrapper, createTestQueryClient, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/workoutPlanTemplatesApi', () => ({
  createWorkoutPlanTemplate: jest.fn(),
  fetchActiveTrainingFocusPlan: jest.fn(),
  fetchWorkoutPlanTemplates: jest.fn(),
  updateWorkoutPlanTemplate: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

const mockFetchWorkoutPlanTemplates =
  fetchWorkoutPlanTemplates as jest.MockedFunction<typeof fetchWorkoutPlanTemplates>;
const mockFetchActiveTrainingFocusPlan =
  fetchActiveTrainingFocusPlan as jest.MockedFunction<typeof fetchActiveTrainingFocusPlan>;
const mockCreateWorkoutPlanTemplate =
  createWorkoutPlanTemplate as jest.MockedFunction<typeof createWorkoutPlanTemplate>;
const mockUpdateWorkoutPlanTemplate =
  updateWorkoutPlanTemplate as jest.MockedFunction<typeof updateWorkoutPlanTemplate>;

const payload = {
  plan_name: 'Training Focus',
  description: null,
  start_date: '2026-07-13',
  end_date: null,
  is_active: true,
  plan_mode: 'training_focus' as const,
  assignments: [],
  focus_sessions: [
    {
      day_of_week: 1,
      time_slot: 'morning' as const,
      training_focus: 'back',
      is_primary: true,
    },
  ],
};

describe('useWorkoutPlanTemplates', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('loads workout plan templates', async () => {
    mockFetchWorkoutPlanTemplates.mockResolvedValueOnce([
      {
        id: 'workout-plan-1',
        ...payload,
      },
    ]);

    const { result } = renderHook(() => useWorkoutPlanTemplates(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchWorkoutPlanTemplates).toHaveBeenCalledTimes(1);
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0]?.plan_mode).toBe('training_focus');
  });

  it('loads the active training focus plan for the selected date', async () => {
    mockFetchActiveTrainingFocusPlan.mockResolvedValueOnce({
      id: 'workout-plan-1',
      ...payload,
    });

    const { result } = renderHook(
      () => useActiveTrainingFocusPlan({ date: '2026-07-13' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchActiveTrainingFocusPlan).toHaveBeenCalledWith('2026-07-13');
    expect(result.current.plan?.plan_name).toBe('Training Focus');
  });

  it('creates a workout plan and refreshes the list', async () => {
    mockCreateWorkoutPlanTemplate.mockResolvedValueOnce({
      id: 'workout-plan-1',
      ...payload,
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateWorkoutPlanTemplate(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createTemplate(payload);
    });

    expect(mockCreateWorkoutPlanTemplate).toHaveBeenCalledWith(payload);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: workoutPlanTemplatesQueryKey,
    });
  });

  it('updates a workout plan and refreshes the list', async () => {
    mockUpdateWorkoutPlanTemplate.mockResolvedValueOnce({
      id: 'workout-plan-1',
      ...payload,
      plan_name: 'Updated Training Focus',
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useUpdateWorkoutPlanTemplate({ templateId: 'workout-plan-1' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.updateTemplate({
        ...payload,
        plan_name: 'Updated Training Focus',
      });
    });

    expect(mockUpdateWorkoutPlanTemplate).toHaveBeenCalledWith({
      ...payload,
      id: 'workout-plan-1',
      plan_name: 'Updated Training Focus',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: workoutPlanTemplatesQueryKey,
    });
  });

  it('shows a toast when create fails', async () => {
    mockCreateWorkoutPlanTemplate.mockRejectedValueOnce(new Error('failed'));

    const { result } = renderHook(() => useCreateWorkoutPlanTemplate(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await expect(result.current.createTemplate(payload)).rejects.toThrow('failed');

    expect(Toast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Failed to create workout plan',
      text2: 'Please try again.',
    });
  });
});
