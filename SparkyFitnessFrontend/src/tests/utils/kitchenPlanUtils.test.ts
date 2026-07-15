import {
  buildKitchenWeek,
  getActiveKitchenTemplate,
  localDateString,
  type KitchenPlanTemplate,
} from '@/pages/Kitchen/kitchenPlanUtils';

const template = (
  overrides: Partial<KitchenPlanTemplate> = {}
): KitchenPlanTemplate => ({
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
  ...overrides,
});

describe('kitchenPlanUtils', () => {
  it('selects the latest active template whose date range contains today', () => {
    const active = getActiveKitchenTemplate(
      [
        template({ id: 'old', start_date: '2026-07-01' }),
        template({ id: 'latest', start_date: '2026-07-10' }),
        template({
          id: 'inactive',
          is_active: false,
          start_date: '2026-07-20',
        }),
      ],
      '2026-07-15'
    );

    expect(active?.id).toBe('latest');
  });

  it('handles undefined templates while active template data is loading', () => {
    expect(getActiveKitchenTemplate(undefined, '2026-07-15')).toBeUndefined();
  });

  it('falls back to the latest active template when today is outside active plan windows', () => {
    const active = getActiveKitchenTemplate(
      [
        template({ id: 'future', start_date: '2026-07-20', end_date: null }),
        template({
          id: 'older',
          start_date: '2026-06-01',
          end_date: '2026-06-30',
        }),
        template({
          id: 'inactive-latest',
          is_active: false,
          start_date: '2026-08-01',
        }),
      ],
      '2026-07-15'
    );

    expect(active?.id).toBe('future');
  });

  it('maps weekday targets by calendar weekday, not start-date offset', () => {
    const week = buildKitchenWeek(template(), '2026-07-14', '2026-07-15');

    expect(week.days.map((day) => day.weekdayLabel)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(week.days[0]!.date).toBe('2026-07-13');
    expect(week.days[0]!.dayNumberLabel).toBe('13');
    expect(week.days[0]!.meals[0]?.label).toBe('Breakfast');
    expect(week.days[1]!.meals[0]?.label).toBe('Pre-Workout');
    expect(week.days[1]!.meals[0]?.items[0]?.name).toBe('米饭');
    expect(week.days[1]!.meals[0]?.items[0]?.amountLabel).toBe('150g');
  });

  it('marks today separately from the selected date', () => {
    const week = buildKitchenWeek(template(), '2026-07-16', '2026-07-15');

    expect(week.selectedDate).toBe('2026-07-16');
    expect(week.todayDate).toBe('2026-07-15');
    expect(week.days.find((day) => day.isSelected)?.date).toBe('2026-07-16');
    expect(week.days.find((day) => day.isToday)?.date).toBe('2026-07-15');
  });

  it('zero-pads day number labels', () => {
    const week = buildKitchenWeek(template(), '2026-07-05', '2026-07-05');

    expect(week.days[6]!.date).toBe('2026-07-05');
    expect(week.days[6]!.dayNumberLabel).toBe('05');
  });

  it('matches assignments to target meals case-insensitively', () => {
    const week = buildKitchenWeek(
      template({
        assignments: [
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'pre-workout',
            food_id: 'rice',
            food_name: '米饭',
            quantity: 150,
            unit: 'g',
            macro_role: 'carb',
          },
        ],
      }),
      '2026-07-14',
      '2026-07-15'
    );

    expect(week.days[1]!.meals[0]?.items[0]?.name).toBe('米饭');
  });

  it('falls back to assignment meal groups when macro targets are missing', () => {
    const week = buildKitchenWeek(
      template({
        macro_targets: {},
        assignments: [
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'Breakfast',
            food_id: 'egg',
            food_name: '鸡蛋',
            quantity: 2,
            unit: '个',
            macro_role: 'protein',
          },
        ],
      }),
      '2026-07-14',
      '2026-07-15'
    );

    expect(week.days[1]!.dayTypeLabel).toBe('Meal Plan');
    expect(week.days[1]!.meals[0]?.label).toBe('Breakfast');
    expect(week.days[1]!.meals[0]?.items[0]?.name).toBe('鸡蛋');
    expect(week.days[1]!.meals[0]?.items[0]?.amountLabel).toBe('2个');
  });

  it('formats local dates without converting through UTC ISO strings', () => {
    const localMidnight = new Date(2026, 6, 5);
    const toISOStringSpy = jest
      .spyOn(localMidnight, 'toISOString')
      .mockImplementation(() => '2026-07-04T16:00:00.000Z');

    expect(localDateString(localMidnight)).toBe('2026-07-05');
    expect(toISOStringSpy).not.toHaveBeenCalled();

    toISOStringSpy.mockRestore();
  });
});
