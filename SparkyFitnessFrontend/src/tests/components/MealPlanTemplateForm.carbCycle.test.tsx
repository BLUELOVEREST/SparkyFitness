import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPlanTemplateForm from '@/pages/Foods/MealPlanTemplateForm';
import { renderWithClient } from '../test-utils';

jest.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'debug' }),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({
    data: [
      { id: 'breakfast', name: 'Breakfast' },
      { id: 'lunch', name: 'Lunch' },
      { id: 'dinner', name: 'Dinner' },
      { id: 'snacks', name: 'Snacks' },
      { id: 'pre', name: 'Pre-Workout' },
      { id: 'post', name: 'Post-Workout' },
    ],
  }),
}));

jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useMostRecentMeasurement: () => ({
    data: { weight: 82.4 },
    isLoading: false,
  }),
}));

const mockPreview = jest.fn();
jest.mock('@/hooks/Goals/useGoals', () => ({
  usePreviewCarbCycleMutation: () => ({
    mutateAsync: mockPreview,
    isPending: false,
  }),
}));

jest.mock('@/components/FoodSearch/FoodSearchDialog', () => () => null);
jest.mock('@/components/FoodUnitSelector', () => () => null);
jest.mock('@/pages/Foods/MealUnitSelector', () => () => null);
jest.mock('@/hooks/Foods/useMeals', () => ({
  mealViewOptions: (id: string) => ({
    queryKey: ['meal', id],
    queryFn: jest.fn(),
  }),
}));
jest.mock('@/hooks/Foods/useFoods', () => ({
  foodViewOptions: (id: string) => ({
    queryKey: ['food', id],
    queryFn: jest.fn(),
  }),
}));

describe('MealPlanTemplateForm carb cycle mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreview.mockResolvedValue({
      weekStartDate: '2026-07-06',
      weekTotals: { calories: 1000, carbs: 100, protein: 100, fat: 50 },
      days: [
        {
          date: '2026-07-06',
          dayType: 'low',
          calories: 1000,
          carbs: 100,
          protein: 100,
          fat: 50,
          trainingSlot: 'morning',
          meals: [
            {
              slotKey: 'morning',
              label: 'Pre-Workout',
              calories: 300,
              carbs: 30,
              protein: 25,
              fat: 0,
            },
          ],
        },
      ],
    });
  });

  it('generates carb-cycle meal targets from the most recent account weight', async () => {
    const onSave = jest.fn();

    renderWithClient(
      <MealPlanTemplateForm
        template={{
          plan_name: 'Next week',
          start_date: '2026-07-06',
          end_date: '2026-07-12',
          is_active: false,
          assignments: [],
        }}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /carb cycle/i }));
    expect(screen.queryByLabelText(/body weight/i)).not.toBeInTheDocument();
    expect(screen.getByText(/82.4 kg/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /generate carb cycle targets/i })
    );

    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          weekStartDate: '2026-07-06',
          bodyWeightKg: 82.4,
          carbsPerKg: 3,
          proteinPerKg: 2,
          fatPerKg: 1,
        })
      );
    });

    expect(await screen.findByText(/Target: 300 kcal/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /common.saveChanges/i })
    );

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        macro_targets: {
          1: [
            expect.objectContaining({
              label: 'Pre-Workout',
              carbs: 30,
              protein: 25,
              fat: 0,
            }),
          ],
        },
      })
    );
  });
});
