import { renderHook, waitFor } from '@testing-library/react-native';
import { useActiveMealPlanDay } from '../../src/hooks/useActiveMealPlanDay';
import { fetchActiveMealPlanDay } from '../../src/services/api/mealPlanTemplatesApi';
import { createQueryWrapper, createTestQueryClient, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/mealPlanTemplatesApi', () => ({
  fetchActiveMealPlanDay: jest.fn(),
  logActiveMealPlanMealToDiary: jest.fn(),
}));

const mockFetchActiveMealPlanDay =
  fetchActiveMealPlanDay as jest.MockedFunction<typeof fetchActiveMealPlanDay>;

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
});
