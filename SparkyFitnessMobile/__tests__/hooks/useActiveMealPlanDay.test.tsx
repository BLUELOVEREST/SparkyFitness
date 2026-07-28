import { act, renderHook, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import {
  useActiveMealPlanDay,
  useLogActiveMealPlanMeal,
} from '../../src/hooks/useActiveMealPlanDay';
import {
  fetchActiveMealPlanDay,
  logActiveMealPlanMealToDiary,
} from '../../src/services/api/mealPlanTemplatesApi';
import {
  activeMealPlanDayQueryKey,
  dailySummaryQueryKey,
} from '../../src/hooks/queryKeys';
import { createQueryWrapper, createTestQueryClient, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/mealPlanTemplatesApi', () => ({
  fetchActiveMealPlanDay: jest.fn(),
  logActiveMealPlanMealToDiary: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

const mockFetchActiveMealPlanDay =
  fetchActiveMealPlanDay as jest.MockedFunction<typeof fetchActiveMealPlanDay>;
const mockLogActiveMealPlanMealToDiary =
  logActiveMealPlanMealToDiary as jest.MockedFunction<typeof logActiveMealPlanMealToDiary>;

describe('useActiveMealPlanDay', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('loads active meal plan day for the selected date', async () => {
    mockFetchActiveMealPlanDay.mockResolvedValueOnce({
      mode: 'carbCycle',
      date: '2026-07-15',
      meals: [],
    });

    const { result } = renderHook(
      () => useActiveMealPlanDay({ date: '2026-07-15' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetchActiveMealPlanDay).toHaveBeenCalledWith('2026-07-15');
    expect(result.current.activeMealPlanDay).toEqual({
      mode: 'carbCycle',
      date: '2026-07-15',
      meals: [],
    });
  });

  it('logs a planned meal and refreshes the active plan day and diary summary', async () => {
    mockLogActiveMealPlanMealToDiary.mockResolvedValueOnce({
      foodEntries: [],
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useLogActiveMealPlanMeal(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        date: '2026-07-15',
        mealTypeId: 'meal-type-pre-workout',
      });
    });

    expect(mockLogActiveMealPlanMealToDiary).toHaveBeenCalledWith(
      '2026-07-15',
      'meal-type-pre-workout',
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: activeMealPlanDayQueryKey('2026-07-15'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-07-15'),
    });
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Planned meal logged',
    });
  });
});
