import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import MealPlanTemplateFormScreen from '../../src/screens/MealPlanTemplateFormScreen';
import {
  useCreateMealPlanTemplate,
  useMostRecentWeight,
  usePreviewCarbCycleWeek,
  useUpdateMealPlanTemplate,
} from '../../src/hooks/useMealPlanTemplates';
import { useActiveTrainingFocusPlan } from '../../src/hooks/useWorkoutPlanTemplates';
import { useFoodsLibrary } from '../../src/hooks/useFoodsLibrary';
import { usePreferences } from '../../src/hooks/usePreferences';

jest.mock('../../src/hooks/useMealPlanTemplates', () => ({
  useCreateMealPlanTemplate: jest.fn(),
  useMostRecentWeight: jest.fn(),
  usePreviewCarbCycleWeek: jest.fn(),
  useUpdateMealPlanTemplate: jest.fn(),
}));

jest.mock('../../src/hooks/useFoodsLibrary', () => ({
  useFoodsLibrary: jest.fn(),
}));

jest.mock('../../src/hooks/useWorkoutPlanTemplates', () => ({
  useActiveTrainingFocusPlan: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseMostRecentWeight =
  useMostRecentWeight as jest.MockedFunction<typeof useMostRecentWeight>;
const mockUsePreviewCarbCycleWeek =
  usePreviewCarbCycleWeek as jest.MockedFunction<typeof usePreviewCarbCycleWeek>;
const mockUseCreateMealPlanTemplate =
  useCreateMealPlanTemplate as jest.MockedFunction<typeof useCreateMealPlanTemplate>;
const mockUseUpdateMealPlanTemplate =
  useUpdateMealPlanTemplate as jest.MockedFunction<typeof useUpdateMealPlanTemplate>;
const mockUseFoodsLibrary =
  useFoodsLibrary as jest.MockedFunction<typeof useFoodsLibrary>;
const mockUseActiveTrainingFocusPlan =
  useActiveTrainingFocusPlan as jest.MockedFunction<typeof useActiveTrainingFocusPlan>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;

describe('MealPlanTemplateFormScreen', () => {
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

  it('generates targets, selects matching macro foods, and saves assignments', async () => {
    const previewCarbCycle = jest.fn().mockResolvedValue({
      weekStartDate: '2026-07-13',
      weekTotals: { calories: 1000, carbs: 100, protein: 100, fat: 50 },
      days: [
        {
          date: '2026-07-13',
          dayType: 'low',
          calories: 1000,
          carbs: 100,
          protein: 100,
          fat: 50,
          trainingSlot: 'rest',
          meals: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              calories: 300,
              carbs: 30,
              protein: 25,
              fat: 8,
            },
          ],
        },
      ],
    });
    const createTemplate = jest.fn().mockResolvedValue({ id: 'template-1' });

    mockUseMostRecentWeight.mockReturnValue({
      measurement: { entry_date: '2026-07-12', weight: 80 },
      weightKg: 80,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUsePreviewCarbCycleWeek.mockReturnValue({
      previewCarbCycle,
      preview: undefined,
      previewCarbCycleSync: jest.fn(),
      isPending: false,
    });
    mockUseCreateMealPlanTemplate.mockReturnValue({
      createTemplate,
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseUpdateMealPlanTemplate.mockReturnValue({
      updateTemplate: jest.fn(),
      updateTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseFoodsLibrary.mockReturnValue({
      foods: [
        {
          id: 'rice-food',
          name: 'Rice',
          brand: null,
          is_custom: true,
          macro_role: 'carb',
          default_variant: {
            id: 'rice-100g',
            serving_size: 100,
            serving_unit: 'g',
            calories: 130,
            carbs: 20,
            protein: 2,
            fat: 1,
          },
        },
        {
          id: 'chicken-food',
          name: 'Chicken Breast',
          brand: null,
          is_custom: true,
          macro_role: 'protein',
          default_variant: {
            id: 'chicken-100g',
            serving_size: 100,
            serving_unit: 'g',
            calories: 120,
            carbs: 0,
            protein: 24,
            fat: 2,
          },
        },
      ],
      isLoading: false,
      isSearching: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    mockUseActiveTrainingFocusPlan.mockReturnValue({
      plan: {
        id: 'workout-plan-1',
        plan_name: 'Training Focus Week',
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
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { goBack: jest.fn() };
    const screen = render(
      <MealPlanTemplateFormScreen
        navigation={navigation as never}
        route={{ params: { mode: 'create' } } as never}
      />,
    );

    fireEvent.changeText(screen.getByPlaceholderText('YYYY-MM-DD'), '2026-07-13');
    fireEvent.press(screen.getByText('Generate Carb Cycle Targets'));

    await waitFor(() => expect(screen.getByText('1000 kcal')).toBeTruthy());
    expect(screen.getByText('Training Focus Plan')).toBeTruthy();
    expect(screen.getByText('Training Focus Week')).toBeTruthy();
    expect(screen.getByText('Monday · 1 session · Main: morning')).toBeTruthy();
    fireEvent.press(screen.getByText('Select Carbs'));
    expect(screen.queryByText('Chicken Breast')).toBeNull();
    fireEvent.press(screen.getByText('Rice'));

    expect(screen.getByText('Rice · 150g')).toBeTruthy();
    expect(screen.getByText('Total C 30.0g · P 3.0g · F 1.5g')).toBeTruthy();
    expect(screen.getByText('Target C 30.0g · P 25.0g · F 8.0g')).toBeTruthy();

    fireEvent.press(screen.getByText('Save Meal Plan'));

    await waitFor(() => expect(createTemplate).toHaveBeenCalledTimes(1));
    expect(createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_name: 'Carb Cycle 2026-07-13',
        start_date: '2026-07-13',
        end_date: '2026-07-19',
        is_active: true,
        assignments: [
          expect.objectContaining({
            item_type: 'food',
            day_of_week: 1,
            meal_type: 'morning',
            food_id: 'rice-food',
            food_name: 'Rice',
            variant_id: 'rice-100g',
            quantity: 150,
            unit: 'g',
            macro_role: 'carb',
          }),
        ],
        macro_targets: {
          1: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              calories: 300,
              carbs: 30,
              protein: 25,
              fat: 8,
            },
          ],
        },
      }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('edits an existing template and clears a selected macro food', async () => {
    mockUseMostRecentWeight.mockReturnValue({
      measurement: { entry_date: '2026-07-12', weight: 80 },
      weightKg: 80,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUsePreviewCarbCycleWeek.mockReturnValue({
      previewCarbCycle: jest.fn(),
      preview: undefined,
      previewCarbCycleSync: jest.fn(),
      isPending: false,
    });
    mockUseCreateMealPlanTemplate.mockReturnValue({
      createTemplate: jest.fn(),
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    const updateTemplate = jest.fn().mockResolvedValue({ id: 'template-1' });
    mockUseUpdateMealPlanTemplate.mockReturnValue({
      updateTemplate,
      updateTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseFoodsLibrary.mockReturnValue({
      foods: [],
      isLoading: false,
      isSearching: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    mockUseActiveTrainingFocusPlan.mockReturnValue({
      plan: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { goBack: jest.fn() };
    const template = {
      id: 'template-1',
      plan_name: 'Existing Carb Cycle',
      description: 'Existing plan',
      start_date: '2026-07-13',
      end_date: '2026-07-19',
      is_active: true,
      macro_targets: {
        1: [
          {
            slotKey: 'morning',
            label: 'Breakfast',
            calories: 300,
            carbs: 30,
            protein: 25,
            fat: 8,
          },
        ],
      },
      assignments: [
        {
          item_type: 'food',
          day_of_week: 1,
          meal_type: 'morning',
          food_id: 'rice-food',
          food_name: 'Rice',
          variant_id: 'rice-100g',
          quantity: 150,
          unit: 'g',
          macro_role: 'carb',
        },
      ],
    };

    const screen = render(
      <MealPlanTemplateFormScreen
        navigation={navigation as never}
        route={{ params: { mode: 'edit', template } } as never}
      />,
    );

    expect(screen.getByText('Existing Carb Cycle')).toBeTruthy();
    expect(screen.getByText('Rice · 150g')).toBeTruthy();

    fireEvent.press(screen.getByText('Clear'));
    fireEvent.press(screen.getByText('Save Meal Plan'));

    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1));
    expect(updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'template-1',
        plan_name: 'Existing Carb Cycle',
        assignments: [],
      }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('updates template details when editing an existing meal plan', async () => {
    mockUseMostRecentWeight.mockReturnValue({
      measurement: { entry_date: '2026-07-12', weight: 80 },
      weightKg: 80,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUsePreviewCarbCycleWeek.mockReturnValue({
      previewCarbCycle: jest.fn(),
      preview: undefined,
      previewCarbCycleSync: jest.fn(),
      isPending: false,
    });
    mockUseCreateMealPlanTemplate.mockReturnValue({
      createTemplate: jest.fn(),
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    const updateTemplate = jest.fn().mockResolvedValue({ id: 'template-1' });
    mockUseUpdateMealPlanTemplate.mockReturnValue({
      updateTemplate,
      updateTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseFoodsLibrary.mockReturnValue({
      foods: [],
      isLoading: false,
      isSearching: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    mockUseActiveTrainingFocusPlan.mockReturnValue({
      plan: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { goBack: jest.fn() };
    const template = {
      id: 'template-1',
      plan_name: 'Existing Carb Cycle',
      description: 'Existing plan',
      start_date: '2026-07-13',
      end_date: '2026-07-19',
      is_active: true,
      macro_targets: {
        1: [
          {
            slotKey: 'morning',
            label: 'Breakfast',
            calories: 300,
            carbs: 30,
            protein: 25,
            fat: 8,
          },
        ],
      },
      assignments: [],
    };

    const screen = render(
      <MealPlanTemplateFormScreen
        navigation={navigation as never}
        route={{ params: { mode: 'edit', template } } as never}
      />,
    );

    fireEvent.changeText(screen.getByDisplayValue('Existing Carb Cycle'), 'Cutting Week');
    fireEvent.changeText(screen.getByDisplayValue('Existing plan'), 'Week 29 plan');
    fireEvent.changeText(screen.getByDisplayValue('2026-07-13'), '2026-07-20');
    fireEvent.changeText(screen.getByDisplayValue('2026-07-19'), '2026-07-26');
    fireEvent.press(screen.getByText('Save Meal Plan'));

    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1));
    expect(updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'template-1',
        plan_name: 'Cutting Week',
        description: 'Week 29 plan',
        start_date: '2026-07-20',
        end_date: '2026-07-26',
      }),
    );
  });

  it('regenerates targets in edit mode and clears stale food assignments', async () => {
    const previewCarbCycle = jest.fn().mockResolvedValue({
      weekStartDate: '2026-07-13',
      weekTotals: { calories: 400, carbs: 40, protein: 30, fat: 10 },
      days: [
        {
          date: '2026-07-13',
          dayType: 'medium',
          calories: 400,
          carbs: 40,
          protein: 30,
          fat: 10,
          trainingSlot: 'morning',
          meals: [
            {
              slotKey: 'morning',
              label: 'Pre-Workout',
              calories: 400,
              carbs: 40,
              protein: 30,
              fat: 10,
            },
          ],
        },
      ],
    });

    mockUseMostRecentWeight.mockReturnValue({
      measurement: { entry_date: '2026-07-12', weight: 80 },
      weightKg: 80,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUsePreviewCarbCycleWeek.mockReturnValue({
      previewCarbCycle,
      preview: undefined,
      previewCarbCycleSync: jest.fn(),
      isPending: false,
    });
    mockUseCreateMealPlanTemplate.mockReturnValue({
      createTemplate: jest.fn(),
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    const updateTemplate = jest.fn().mockResolvedValue({ id: 'template-1' });
    mockUseUpdateMealPlanTemplate.mockReturnValue({
      updateTemplate,
      updateTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseFoodsLibrary.mockReturnValue({
      foods: [],
      isLoading: false,
      isSearching: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    mockUseActiveTrainingFocusPlan.mockReturnValue({
      plan: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const navigation = { goBack: jest.fn() };
    const template = {
      id: 'template-1',
      plan_name: 'Existing Carb Cycle',
      description: 'Existing plan',
      start_date: '2026-07-13',
      end_date: '2026-07-19',
      is_active: true,
      macro_targets: {
        1: [
          {
            slotKey: 'morning',
            label: 'Breakfast',
            calories: 300,
            carbs: 30,
            protein: 25,
            fat: 8,
          },
        ],
      },
      assignments: [
        {
          item_type: 'food',
          day_of_week: 1,
          meal_type: 'morning',
          food_id: 'rice-food',
          food_name: 'Rice',
          variant_id: 'rice-100g',
          quantity: 150,
          unit: 'g',
          macro_role: 'carb',
        },
      ],
    };

    const screen = render(
      <MealPlanTemplateFormScreen
        navigation={navigation as never}
        route={{ params: { mode: 'edit', template } } as never}
      />,
    );

    expect(screen.getByText('Rice · 150g')).toBeTruthy();

    fireEvent.press(screen.getByText('Generate Carb Cycle Targets'));

    await waitFor(() => expect(screen.getByText('Pre-Workout')).toBeTruthy());
    expect(screen.queryByText('Rice · 150g')).toBeNull();

    fireEvent.press(screen.getByText('Save Meal Plan'));

    await waitFor(() => expect(updateTemplate).toHaveBeenCalledTimes(1));
    expect(updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'template-1',
        macro_targets: {
          1: [
            {
              slotKey: 'morning',
              label: 'Pre-Workout',
              calories: 400,
              carbs: 40,
              protein: 30,
              fat: 10,
            },
          ],
        },
        assignments: [],
      }),
    );
  });

  it('shows empty state and loads more foods in the macro food picker', async () => {
    const previewCarbCycle = jest.fn().mockResolvedValue({
      weekStartDate: '2026-07-13',
      weekTotals: { calories: 300, carbs: 30, protein: 25, fat: 8 },
      days: [
        {
          date: '2026-07-13',
          dayType: 'low',
          calories: 300,
          carbs: 30,
          protein: 25,
          fat: 8,
          trainingSlot: 'rest',
          meals: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              calories: 300,
              carbs: 30,
              protein: 25,
              fat: 8,
            },
          ],
        },
      ],
    });
    const loadMore = jest.fn();

    mockUseMostRecentWeight.mockReturnValue({
      measurement: { entry_date: '2026-07-12', weight: 80 },
      weightKg: 80,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUsePreviewCarbCycleWeek.mockReturnValue({
      previewCarbCycle,
      preview: undefined,
      previewCarbCycleSync: jest.fn(),
      isPending: false,
    });
    mockUseCreateMealPlanTemplate.mockReturnValue({
      createTemplate: jest.fn(),
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseUpdateMealPlanTemplate.mockReturnValue({
      updateTemplate: jest.fn(),
      updateTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseFoodsLibrary.mockReturnValue({
      foods: [],
      isLoading: false,
      isSearching: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      loadMore,
      refetch: jest.fn(),
    });
    mockUseActiveTrainingFocusPlan.mockReturnValue({
      plan: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = render(
      <MealPlanTemplateFormScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ params: { mode: 'create' } } as never}
      />,
    );

    fireEvent.press(screen.getByText('Generate Carb Cycle Targets'));

    await waitFor(() => expect(screen.getByText('Breakfast')).toBeTruthy());
    fireEvent.press(screen.getByText('Select Carbs'));

    expect(screen.getByText('No Carbs foods found.')).toBeTruthy();
    fireEvent.press(screen.getByText('Load more foods'));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('uses compact change and clear actions and can cancel the macro food picker', async () => {
    const previewCarbCycle = jest.fn().mockResolvedValue({
      weekStartDate: '2026-07-13',
      weekTotals: { calories: 300, carbs: 30, protein: 25, fat: 8 },
      days: [
        {
          date: '2026-07-13',
          dayType: 'low',
          calories: 300,
          carbs: 30,
          protein: 25,
          fat: 8,
          trainingSlot: 'rest',
          meals: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              calories: 300,
              carbs: 30,
              protein: 25,
              fat: 8,
            },
          ],
        },
      ],
    });

    mockUseMostRecentWeight.mockReturnValue({
      measurement: { entry_date: '2026-07-12', weight: 80 },
      weightKg: 80,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUsePreviewCarbCycleWeek.mockReturnValue({
      previewCarbCycle,
      preview: undefined,
      previewCarbCycleSync: jest.fn(),
      isPending: false,
    });
    mockUseCreateMealPlanTemplate.mockReturnValue({
      createTemplate: jest.fn(),
      createTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseUpdateMealPlanTemplate.mockReturnValue({
      updateTemplate: jest.fn(),
      updateTemplateSync: jest.fn(),
      isPending: false,
    });
    mockUseFoodsLibrary.mockReturnValue({
      foods: [
        {
          id: 'rice-food',
          name: 'Rice',
          brand: null,
          is_custom: true,
          macro_role: 'carb',
          default_variant: {
            id: 'rice-100g',
            serving_size: 100,
            serving_unit: 'g',
            calories: 130,
            carbs: 20,
            protein: 2,
            fat: 1,
          },
        },
      ],
      isLoading: false,
      isSearching: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      loadMore: jest.fn(),
      refetch: jest.fn(),
    });
    mockUseActiveTrainingFocusPlan.mockReturnValue({
      plan: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = render(
      <MealPlanTemplateFormScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ params: { mode: 'create' } } as never}
      />,
    );

    fireEvent.press(screen.getByText('Generate Carb Cycle Targets'));

    await waitFor(() => expect(screen.getByText('Breakfast')).toBeTruthy());
    fireEvent.press(screen.getByText('Select Carbs'));
    fireEvent.press(screen.getByText('Rice'));

    expect(screen.getByText('Rice · 150g')).toBeTruthy();
    expect(screen.getByText('Change')).toBeTruthy();
    expect(screen.getByText('Clear')).toBeTruthy();
    expect(screen.queryByText('Change Carbs')).toBeNull();
    expect(screen.queryByText('Clear Carbs')).toBeNull();

    fireEvent.press(screen.getByText('Change'));
    expect(screen.getByText('Select Carbs Food')).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel selection'));

    expect(screen.queryByText('Select Carbs Food')).toBeNull();
  });
});
