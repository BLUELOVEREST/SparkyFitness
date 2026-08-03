import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import Kitchen from '@/pages/Kitchen/Kitchen';
import { renderWithClient } from '@/tests/test-utils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

const mockGetMealPlanTemplates = jest.fn();

jest.mock('@/api/Foods/mealPlanTemplate', () => ({
  getMealPlanTemplates: (...args: unknown[]) =>
    mockGetMealPlanTemplates(...args),
}));

const renderKitchen = (todayOverride = '2026-07-15') =>
  renderWithClient(
    <MemoryRouter>
      <Kitchen todayOverride={todayOverride} />
    </MemoryRouter>
  );

describe('Kitchen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an empty state when no active meal plan exists', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderKitchen();

    expect(
      screen.getByRole('heading', { name: 'Kitchen' })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('No active meal plan')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Create or activate a Meal Plan/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Create or activate a Meal Plan/i })
    ).toHaveAttribute('href', '/foods');
  });

  it('renders weekday tabs, target macros, and planned food amounts after selecting Tuesday', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([
      {
        id: 'plan-1',
        plan_name: 'Eric carb cycle',
        start_date: '2026-07-14',
        end_date: null,
        is_active: true,
        macro_targets: {
          1: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              carbs: 28,
              protein: 40,
              fat: 30,
              calories: 542,
            },
          ],
          2: [
            {
              slotKey: 'morning',
              label: 'Pre-Workout',
              carbs: 39.2,
              protein: 30,
              fat: 0,
              calories: 277,
            },
          ],
        },
        assignments: [
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'Pre-Workout',
            food_id: 'rice',
            food_name: '米饭',
            quantity: 150,
            unit: 'g',
            macro_role: 'carb',
          },
        ],
      },
    ]);

    renderKitchen();

    expect(await screen.findByText('Eric carb cycle')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Monday/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Tuesday/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Wednesday/i })).toHaveAttribute(
      'aria-current',
      'date'
    );

    fireEvent.click(screen.getByRole('tab', { name: /Tuesday/i }));

    const todayTab = screen.getByRole('tab', { name: /Wednesday/i });
    expect(todayTab).toHaveAttribute('aria-current', 'date');
    expect(todayTab.className).toContain('ring-inset');
    expect(todayTab.className).not.toContain('ring-offset-2');

    expect(screen.getByText('Low Carb')).toBeInTheDocument();
    expect(screen.getAllByText('277 kcal').length).toBeGreaterThan(0);
    expect(screen.getByText('39.2g carbs')).toBeInTheDocument();
    expect(screen.getByText('30g protein')).toBeInTheDocument();
    expect(screen.getByText('0g fat')).toBeInTheDocument();
    expect(screen.getByText('Pre-Workout')).toBeInTheDocument();
    expect(screen.getAllByText('米饭').length).toBeGreaterThan(0);
    expect(screen.getAllByText('150g').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Target C 39.2g / P 30g / F 0g / 277 kcal')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Daily Prep' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ingredients needed for Tuesday.')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Tuesday Pre-Workout').length).toBeGreaterThan(
      0
    );
    expect(
      screen.getByRole('heading', { name: 'Weekly Prep' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Total ingredients for this week.')
    ).toBeInTheDocument();
  });

  it('summarizes weekly ingredients across the active meal plan week', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([
      {
        id: 'plan-1',
        plan_name: 'Eric carb cycle',
        start_date: '2026-07-14',
        end_date: null,
        is_active: true,
        macro_targets: {
          1: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              carbs: 28,
              protein: 40,
              fat: 30,
              calories: 542,
            },
          ],
          2: [
            {
              slotKey: 'evening',
              label: 'Dinner',
              carbs: 39.2,
              protein: 30,
              fat: 0,
              calories: 277,
            },
          ],
        },
        assignments: [
          {
            item_type: 'food',
            day_of_week: 1,
            meal_type: 'Breakfast',
            food_id: 'rice',
            food_name: '米饭',
            quantity: 150,
            unit: 'g',
            macro_role: 'carb',
          },
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'Dinner',
            food_id: 'rice',
            food_name: '米饭',
            quantity: 200,
            unit: 'g',
            macro_role: 'carb',
          },
        ],
      },
    ]);

    renderKitchen();

    expect(await screen.findByText('Eric carb cycle')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Weekly Prep' })
    ).toBeInTheDocument();
    expect(screen.getByText('350g')).toBeInTheDocument();
    expect(
      screen.getByText('Monday Breakfast · Tuesday Dinner')
    ).toBeInTheDocument();
  });

  it('defaults to the plan start date when today is before the active plan window', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([
      {
        id: 'future-plan',
        plan_name: 'Future carb cycle',
        start_date: '2026-07-20',
        end_date: null,
        is_active: true,
        macro_targets: {
          1: [
            {
              slotKey: 'morning',
              label: 'Future Breakfast',
              carbs: 60,
              protein: 35,
              fat: 15,
              calories: 515,
            },
          ],
        },
        assignments: [
          {
            item_type: 'food',
            day_of_week: 1,
            meal_type: 'Future Breakfast',
            food_id: 'oats',
            food_name: 'Oats',
            quantity: 80,
            unit: 'g',
            macro_role: 'carb',
          },
        ],
      },
    ]);

    renderKitchen('2026-07-15');

    expect(await screen.findByText('Future carb cycle')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Monday/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('2026-07-20')).toBeInTheDocument();
    expect(screen.getByText('Future Breakfast')).toBeInTheDocument();
    expect(screen.getAllByText('Oats').length).toBeGreaterThan(0);
    expect(screen.getAllByText('80g').length).toBeGreaterThan(0);
  });
});
