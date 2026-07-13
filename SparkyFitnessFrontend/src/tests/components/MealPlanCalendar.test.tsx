import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MealPlanCalendar from '../../pages/Foods/MealPlanCalendar';
import { renderWithClient } from '../test-utils';

// Mock react-i18next
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

// Mock contexts
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'test-user-id' }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'debug', foodDisplayLimit: 100 }),
}));

// Mock toast
jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

// Mock logging
jest.mock('@/utils/logging', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock services
const mockGetMealPlanTemplates = jest.fn();
jest.mock('@/api/Foods/mealPlanTemplate', () => ({
  getMealPlanTemplates: (...args: unknown[]) =>
    mockGetMealPlanTemplates(...args),
  createMealPlanTemplate: jest.fn(),
  updateMealPlanTemplate: jest.fn(),
  deleteMealPlanTemplate: jest.fn(),
}));

// Mock MealPlanTemplateForm sub-component
const mockMealPlanTemplateForm = jest.fn();
jest.mock('@/pages/Foods/MealPlanTemplateForm', () => {
  return function MockMealPlanTemplateForm(props: unknown) {
    mockMealPlanTemplateForm(props);
    return (
      <div data-testid="meal-plan-template-form">MealPlanTemplateForm</div>
    );
  };
});

jest.mock('@/pages/Goals/CarbCyclePlannerCard', () => ({
  CarbCyclePlannerCard: ({
    onPlanMeals,
  }: {
    onPlanMeals?: (preview: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onPlanMeals?.({
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
        })
      }
    >
      Mock Plan Meals
    </button>
  ),
}));

describe('MealPlanCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders heading', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderWithClient(<MealPlanCalendar />);

    // Title uses t('mealPlanCalendar.title') with no fallback, so mock returns the key
    expect(screen.getByText('mealPlanCalendar.title')).toBeInTheDocument();
  });

  it('shows empty state after loading', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderWithClient(<MealPlanCalendar />);

    await waitFor(() => {
      expect(screen.getByText('No results.')).toBeInTheDocument();
    });
  });

  it('opens a carb cycle meal plan draft from preview targets', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderWithClient(<MealPlanCalendar />);

    fireEvent.click(screen.getByRole('button', { name: /mock plan meals/i }));

    expect(screen.getByTestId('meal-plan-template-form')).toBeInTheDocument();
    expect(mockMealPlanTemplateForm).toHaveBeenCalledWith(
      expect.objectContaining({
        template: expect.objectContaining({
          plan_name: 'Carb Cycle 2026-07-06',
          start_date: '2026-07-06',
          end_date: '2026-07-12',
        }),
        mealMacroTargetsByDay: {
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
