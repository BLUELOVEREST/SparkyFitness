import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';
import {
  createMealPlanTemplate,
  fetchMealPlanTemplates,
} from '../../src/services/api/mealPlanTemplatesApi';
import { previewCarbCycleWeek } from '../../src/services/api/goalsApi';
import { fetchMostRecentMeasurement } from '../../src/services/api/measurementsApi';
import {
  useCreateMealPlanTemplate,
  useMealPlanTemplates,
  useMostRecentWeight,
  usePreviewCarbCycleWeek,
} from '../../src/hooks/useMealPlanTemplates';

jest.mock('../../src/services/api/mealPlanTemplatesApi', () => ({
  createMealPlanTemplate: jest.fn(),
  fetchMealPlanTemplates: jest.fn(),
}));

jest.mock('../../src/services/api/goalsApi', () => ({
  previewCarbCycleWeek: jest.fn(),
}));

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMostRecentMeasurement: jest.fn(),
}));

const mockFetchMealPlanTemplates =
  fetchMealPlanTemplates as jest.MockedFunction<typeof fetchMealPlanTemplates>;
const mockCreateMealPlanTemplate =
  createMealPlanTemplate as jest.MockedFunction<typeof createMealPlanTemplate>;
const mockPreviewCarbCycleWeek =
  previewCarbCycleWeek as jest.MockedFunction<typeof previewCarbCycleWeek>;
const mockFetchMostRecentMeasurement =
  fetchMostRecentMeasurement as jest.MockedFunction<typeof fetchMostRecentMeasurement>;

describe('useMealPlanTemplates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads meal plan templates', async () => {
    mockFetchMealPlanTemplates.mockResolvedValueOnce([
      {
        id: 'template-1',
        plan_name: 'Carb Cycle',
        start_date: '2026-07-13',
        end_date: null,
        is_active: true,
        macro_targets: {},
        assignments: [],
      },
    ]);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useMealPlanTemplates(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchMealPlanTemplates).toHaveBeenCalledTimes(1);
    expect(result.current.templates).toHaveLength(1);
    expect(result.current.templates[0]?.plan_name).toBe('Carb Cycle');
  });

  it('creates a meal plan template', async () => {
    const payload = {
      plan_name: 'Mobile Carb Cycle',
      description: null,
      start_date: '2026-07-13',
      end_date: null,
      is_active: true,
      macro_targets: {},
      assignments: [],
    };
    mockCreateMealPlanTemplate.mockResolvedValueOnce({
      id: 'template-1',
      ...payload,
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useCreateMealPlanTemplate(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createTemplate(payload);
    });

    expect(mockCreateMealPlanTemplate).toHaveBeenCalledWith(payload);
  });

  it('previews a carb cycle week', async () => {
    const payload = {
      weekStartDate: '2026-07-13',
      bodyWeightKg: 80,
      carbsPerKg: 2,
      proteinPerKg: 1.5,
      fatPerKg: 0.8,
    };
    const preview = {
      weekStartDate: '2026-07-13',
      weekTotals: { calories: 1000, carbs: 100, protein: 100, fat: 50 },
      days: [],
    };
    mockPreviewCarbCycleWeek.mockResolvedValueOnce(preview);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => usePreviewCarbCycleWeek(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await expect(result.current.previewCarbCycle(payload)).resolves.toEqual(preview);
    });

    expect(mockPreviewCarbCycleWeek).toHaveBeenCalledWith(payload);
  });

  it('loads the most recent body weight', async () => {
    mockFetchMostRecentMeasurement.mockResolvedValueOnce({
      entry_date: '2026-07-15',
      weight: 80,
    });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useMostRecentWeight(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFetchMostRecentMeasurement).toHaveBeenCalledWith('weight');
    expect(result.current.weightKg).toBe(80);
  });
});
