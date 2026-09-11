import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  usePreferences: () => ({
    loggingLevel: 'debug',
    foodDisplayLimit: 100,
    itemDisplayLimit: 100,
    firstDayOfWeek: 1,
  }),
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
      expect(screen.getAllByText('No results found.')).toHaveLength(2);
    });
  });

  it('opens the native meal plan form from the create button', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderWithClient(<MealPlanCalendar />);

    fireEvent.click(
      screen.getByRole('button', { name: /mealPlanCalendar.createNewPlan/i })
    );

    expect(screen.getByTestId('meal-plan-template-form')).toBeInTheDocument();
    expect(mockMealPlanTemplateForm).toHaveBeenCalledWith(
      expect.objectContaining({
        template: undefined,
      })
    );
  });

  it('shows meal plan details grouped by configured week order and grouped by meal', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([
      {
        id: 'plan-1',
        plan_name: 'Cutting week',
        description: 'Weekly food plan',
        start_date: '2026-08-17',
        end_date: '2026-08-23',
        is_active: true,
        macro_targets: {
          1: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              calories: 300,
              carbs: 30,
              protein: 30,
              fat: 10,
            },
            {
              slotKey: 'evening',
              label: 'Dinner',
              calories: 450,
              carbs: 45,
              protein: 40,
              fat: 15,
            },
            {
              slotKey: 'pre_morning',
              label: 'Pre-Workout',
              calories: 250,
              carbs: 40,
              protein: 20,
              fat: 5,
            },
          ],
        },
        assignments: [
          {
            item_type: 'food',
            day_of_week: 1,
            meal_type: 'breakfast',
            food_name: 'Eggs',
            quantity: 120,
            unit: 'g',
          },
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'pre-workout',
            food_name: 'Noodles',
            quantity: 100,
            unit: 'g',
            macro_role: 'carb',
          },
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'Pre-Workout',
            food_name: 'Chicken breast',
            quantity: 180,
            unit: 'g',
            macro_role: 'protein',
          },
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'Pre-Workout',
            food_name: 'Almonds',
            quantity: 12,
            unit: 'g',
            macro_role: 'fat',
          },
          {
            item_type: 'food',
            day_of_week: 0,
            meal_type: 'Dinner',
            food_name: 'Cod',
            quantity: 200,
            unit: 'g',
          },
        ],
      },
    ]);

    renderWithClient(<MealPlanCalendar />);

    const planTitles = await screen.findAllByText('Cutting week');
    const planTitle = planTitles[0];
    if (!planTitle) {
      throw new Error('Expected meal plan title to render');
    }
    fireEvent.click(planTitle);

    const monday = await screen.findByTestId('meal-plan-day-1');
    const tuesday = screen.getByTestId('meal-plan-day-2');
    const sunday = screen.getByTestId('meal-plan-day-0');

    expect(monday.compareDocumentPosition(tuesday)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(tuesday.compareDocumentPosition(sunday)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(monday).not.toHaveTextContent('Rest');
    expect(monday).toHaveTextContent('Breakfast');
    expect(monday).toHaveTextContent('Eggs');
    expect(monday).toHaveTextContent('120g');
    expect(monday).toHaveTextContent('Dinner');
    expect(
      monday.querySelectorAll('[data-testid^="meal-plan-day-1-"]')
    ).toHaveLength(3);

    const tuesdayMeal = screen.getByTestId('meal-plan-day-2-Pre-Workout');
    expect(tuesdayMeal).toHaveTextContent('Pre-Workout');
    const tuesdayFoods = within(tuesdayMeal).getAllByTestId(
      'meal-plan-food-item'
    );
    expect(tuesdayFoods.map((food) => food.textContent)).toEqual([
      'Noodles100g',
      'Chicken breast180g',
      'Almonds12g',
    ]);
    expect(
      tuesday.querySelectorAll('[data-testid^="meal-plan-day-2-"]')
    ).toHaveLength(1);
    expect(sunday).toHaveTextContent('Dinner');
    expect(sunday).toHaveTextContent('Cod');
  });
});
