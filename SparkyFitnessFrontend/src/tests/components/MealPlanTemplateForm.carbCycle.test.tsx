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

  it('shows only the generated meal targets for each carb-cycle day', async () => {
    const onSave = jest.fn();
    mockPreview.mockResolvedValueOnce({
      weekStartDate: '2026-07-06',
      weekTotals: { calories: 7000, carbs: 700, protein: 700, fat: 350 },
      days: [
        {
          date: '2026-07-06',
          dayType: 'high',
          calories: 1200,
          carbs: 150,
          protein: 100,
          fat: 30,
          trainingSlot: 'morning',
          meals: [
            {
              slotKey: 'morning',
              label: 'Pre-Workout',
              calories: 300,
              carbs: 45,
              protein: 25,
              fat: 0,
            },
            {
              slotKey: 'post_morning',
              label: 'Post-Workout',
              calories: 400,
              carbs: 60,
              protein: 35,
              fat: 5,
            },
            {
              slotKey: 'lunch',
              label: 'Lunch',
              calories: 250,
              carbs: 25,
              protein: 20,
              fat: 12,
            },
            {
              slotKey: 'dinner',
              label: 'Dinner',
              calories: 250,
              carbs: 20,
              protein: 20,
              fat: 13,
            },
          ],
        },
        ...Array.from({ length: 6 }, (_, index) => ({
          date: `2026-07-${String(index + 7).padStart(2, '0')}`,
          dayType: 'low',
          calories: 900,
          carbs: 70,
          protein: 100,
          fat: 45,
          trainingSlot: null,
          meals: [
            {
              slotKey: 'breakfast',
              label: 'Breakfast',
              calories: 300,
              carbs: 25,
              protein: 35,
              fat: 15,
            },
            {
              slotKey: 'lunch',
              label: 'Lunch',
              calories: 300,
              carbs: 25,
              protein: 35,
              fat: 15,
            },
            {
              slotKey: 'dinner',
              label: 'Dinner',
              calories: 300,
              carbs: 20,
              protein: 30,
              fat: 15,
            },
          ],
        })),
      ],
    });

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
    fireEvent.click(
      screen.getByRole('button', { name: /generate carb cycle targets/i })
    );

    await waitFor(() => expect(mockPreview).toHaveBeenCalled());
    expect(
      await screen.findByText(/Daily Target for Monday/i)
    ).toBeInTheDocument();

    expect(screen.getAllByText('Pre-Workout')).toHaveLength(1);
    expect(screen.getAllByText('Post-Workout')).toHaveLength(1);
    expect(screen.getAllByText('Breakfast')).toHaveLength(6);
    expect(screen.getByText(/1200 kcal/)).toBeInTheDocument();
  });
});
