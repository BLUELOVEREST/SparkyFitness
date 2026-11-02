import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { NutrientGoalPreferenceEntry } from '@workspace/shared';
import type { DiaryWidget } from '@/pages/Diary/DiaryWidgetGrid';
import type { ActiveMealPlanDay } from '@/types/meal';
import Diary from '@/pages/Diary/Diary';

const mockGoals = { calories: 1800, protein: 100, carbs: 200, fat: 60 };
let mockRemaining = 1256;
let mockCaloriePreference: NutrientGoalPreferenceEntry | undefined;
let mockActiveMealPlanDay: ActiveMealPlanDay | undefined;

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'test-user' }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    loggingLevel: 'SILENT',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
  }),
}));
jest.mock('@/hooks/Settings/useNutrientGoalPreferences', () => ({
  useNutrientGoalPreferences: () => ({
    data: mockCaloriePreference ? { calories: mockCaloriePreference } : {},
  }),
}));
jest.mock('@/hooks/Diary/useDailyProgress', () => ({
  useDailySummary: () => ({
    data: {
      calorieBalance: { goal: 1800, eaten: 1225, remaining: mockRemaining },
    },
  }),
}));
jest.mock('@/hooks/Foods/useMealplanTemplate', () => ({
  useActiveMealPlanDay: () => ({ data: mockActiveMealPlanDay }),
  useLogActiveMealPlanMealMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useDiaryGoals: () => ({ data: mockGoals }),
  useFoodEntries: () => ({ data: [] }),
  useFoodEntryMeals: () => ({ data: [] }),
  useCreateFoodEntryMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteFoodEntryMutation: () => ({ mutateAsync: jest.fn() }),
  useCopyFoodEntriesMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteFoodEntryMealMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));
jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({ data: [] }),
}));
jest.mock('@/hooks/useGenericHealth', () => ({
  useDailyHealthMetrics: () => ({ data: [] }),
}));
jest.mock('@/pages/Diary/DiaryWidgetGrid', () => ({
  __esModule: true,
  default: ({ widgets }: { widgets: DiaryWidget[] }) => (
    <>{widgets.find((widget) => widget.key === 'nutrition')?.render()}</>
  ),
}));
jest.mock('@/pages/Diary/NutritionSummaryCard', () => ({
  __esModule: true,
  default: ({
    calorieBudget,
    goals,
  }: {
    calorieBudget?: number;
    goals: typeof mockGoals;
  }) => (
    <>
      <output aria-label="Calorie budget">{calorieBudget}</output>
      <output aria-label="Plan calorie target">{goals.calories}</output>
    </>
  ),
}));
jest.mock('@/pages/Diary/DailyProgress', () => () => null);
jest.mock('@/pages/Diary/WaterIntake', () => () => null);
jest.mock('@/pages/Diary/CaffeineCard', () => () => null);
jest.mock('@/pages/Diary/MealCard', () => () => null);
jest.mock('@/pages/Diary/ExerciseCard', () => () => null);
jest.mock('@/pages/Diary/EditFoodEntryDialog', () => () => null);
jest.mock('@/pages/Diary/EditMealFoodEntryDialog', () => () => null);
jest.mock('@/pages/Diary/CopyFoodEntryDialog', () => () => null);
jest.mock('@/pages/Diary/CopyFamilyEntryDialog', () => () => null);
jest.mock('@/pages/Diary/ConvertToMealDialog', () => () => null);
jest.mock('@/pages/Diary/LogMealDialog', () => () => null);
jest.mock('@/components/FoodUnitSelector', () => () => null);
jest.mock('@/components/DayNavigator', () => () => null);
jest.mock('@/components/Health/DailyHealthMetricsCard', () => ({
  DailyHealthMetricsCard: () => null,
}));

const renderDiary = () =>
  render(
    <MemoryRouter>
      <Diary />
    </MemoryRouter>
  );

beforeEach(() => {
  mockRemaining = 1256;
  mockCaloriePreference = undefined;
  mockActiveMealPlanDay = undefined;
});

it('uses the same target ceiling plus credited activity as the energy ring', () => {
  mockCaloriePreference = {
    goalType: 'target',
    targetMin: 1600,
    targetMax: 2000,
  };
  renderDiary();
  expect(screen.getByLabelText('Calorie budget')).toHaveTextContent('2681');
});

it('does not add activity credit when the server applies a fixed budget', () => {
  mockRemaining = 575;
  mockCaloriePreference = {
    goalType: 'target',
    targetMin: 1600,
    targetMax: 2000,
  };
  renderDiary();
  expect(screen.getByLabelText('Calorie budget')).toHaveTextContent('2000');
});

it('keeps the server budget without a complete target band', () => {
  mockCaloriePreference = { goalType: 'target', targetMax: 2000 };
  renderDiary();
  expect(screen.getByLabelText('Calorie budget')).toHaveTextContent('2481');
});

it('refreshes the summary budget when the calorie preference changes', () => {
  const { rerender } = renderDiary();
  expect(screen.getByLabelText('Calorie budget')).toHaveTextContent('2481');
  mockCaloriePreference = {
    goalType: 'target',
    targetMin: 1600,
    targetMax: 2000,
  };
  rerender(
    <MemoryRouter>
      <Diary />
    </MemoryRouter>
  );
  expect(screen.getByLabelText('Calorie budget')).toHaveTextContent('2681');
});

it('keeps summed carb-cycle meal targets fixed despite activity credit and a target band', () => {
  mockCaloriePreference = {
    goalType: 'target',
    targetMin: 1600,
    targetMax: 2000,
  };
  mockActiveMealPlanDay = {
    mode: 'carbCycle',
    date: '2026-11-02',
    templateId: 'carb-plan',
    planName: 'Carb cycle',
    meals: [600, 900].map((calories, index) => ({
      key: `meal-${index}`,
      mealTypeId: null,
      mealType: 'Breakfast',
      label: 'Planned meal',
      target: {
        slotKey: 'morning',
        label: 'Planned meal',
        calories,
        carbs: 50,
        protein: 30,
        fat: 20,
      },
      items: [],
      logged: false,
    })),
  };
  const { rerender } = renderDiary();
  expect(screen.getByLabelText('Calorie budget')).toBeEmptyDOMElement();
  expect(screen.getByLabelText('Plan calorie target')).toHaveTextContent(
    /^1500$/
  );

  mockRemaining = 2000;
  rerender(
    <MemoryRouter>
      <Diary />
    </MemoryRouter>
  );
  expect(screen.getByLabelText('Calorie budget')).toBeEmptyDOMElement();
  expect(screen.getByLabelText('Plan calorie target')).toHaveTextContent(
    /^1500$/
  );
});
