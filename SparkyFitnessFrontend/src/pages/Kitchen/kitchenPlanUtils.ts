import type { CarbCycleMealTarget } from '@/types/goals';
import type {
  MealPlanTemplate,
  MealPlanTemplateAssignment,
} from '@/types/meal';

export type KitchenPlanTemplate = Omit<MealPlanTemplate, 'end_date'> & {
  end_date?: string | null;
};

export interface KitchenPlannedItem {
  id: string;
  type: MealPlanTemplateAssignment['item_type'];
  name: string;
  quantity: number;
  unit: string;
  amountLabel: string;
  macroRole?: MealPlanTemplateAssignment['macro_role'];
}

export interface KitchenMealPreview {
  key: string;
  label: string;
  target: CarbCycleMealTarget;
  items: KitchenPlannedItem[];
}

export interface KitchenDayPreview {
  dayIndex: number;
  date: string;
  weekdayLabel: string;
  shortLabel: string;
  dayNumberLabel: string;
  isToday: boolean;
  isSelected: boolean;
  dayTypeLabel: string;
  targetCalories: number;
  targetCarbs: number;
  targetProtein: number;
  targetFat: number;
  meals: KitchenMealPreview[];
}

export interface KitchenWeekPreview {
  template: KitchenPlanTemplate;
  selectedDate: string;
  todayDate: string;
  days: KitchenDayPreview[];
}

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const SHORT_WEEKDAY_LABELS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

const parseLocalDate = (date: string): Date =>
  new Date(`${date}T00:00:00.000Z`);

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getWeekMonday = (date: string): Date => {
  const selected = parseLocalDate(date);
  const dayIndex = selected.getUTCDay();
  const daysSinceMonday = dayIndex === 0 ? 6 : dayIndex - 1;

  return addDays(selected, -daysSinceMonday);
};

const isWithinTemplateRange = (
  template: KitchenPlanTemplate,
  todayDate: string
): boolean => {
  if (!template.is_active) return false;
  if (template.start_date > todayDate) return false;
  if (template.end_date && template.end_date < todayDate) return false;

  return true;
};

const getTemplateStartTime = (template: KitchenPlanTemplate): number =>
  parseLocalDate(template.start_date).getTime();

const normalizeTargets = (
  targets: KitchenPlanTemplate['macro_targets']
): Record<number, CarbCycleMealTarget[]> => {
  if (!targets) return {};

  return Object.entries(targets).reduce<Record<number, CarbCycleMealTarget[]>>(
    (normalized, [dayIndex, meals]) => ({
      ...normalized,
      [Number(dayIndex)]: Array.isArray(meals) ? meals : [],
    }),
    {}
  );
};

const getAssignmentName = (assignment: MealPlanTemplateAssignment): string => {
  if (assignment.item_type === 'meal') {
    return assignment.meal_name ?? 'Meal';
  }

  return assignment.food_name ?? 'Food';
};

const getAssignmentId = (
  assignment: MealPlanTemplateAssignment,
  fallbackIndex: number
): string => {
  if (assignment.item_type === 'meal') {
    return assignment.meal_id ?? `meal-${fallbackIndex}`;
  }

  return assignment.food_id ?? `food-${fallbackIndex}`;
};

const formatAmount = (quantity: number, unit: string): string => {
  const roundedQuantity = Number.isInteger(quantity)
    ? quantity
    : Number(quantity.toFixed(1));

  return `${roundedQuantity}${unit}`;
};

const formatTwoDigits = (value: number): string =>
  String(value).padStart(2, '0');

const normalizeMealType = (mealType: string): string =>
  mealType.trim().toLocaleLowerCase();

const utcDateString = (date: Date): string =>
  [
    date.getUTCFullYear(),
    formatTwoDigits(date.getUTCMonth() + 1),
    formatTwoDigits(date.getUTCDate()),
  ].join('-');

const assignmentToItem = (
  assignment: MealPlanTemplateAssignment,
  fallbackIndex: number
): KitchenPlannedItem => {
  const quantity = assignment.quantity ?? 1;
  const unit = assignment.unit ?? 'serving';

  return {
    id: getAssignmentId(assignment, fallbackIndex),
    type: assignment.item_type,
    name: getAssignmentName(assignment),
    quantity,
    unit,
    amountLabel: formatAmount(quantity, unit),
    macroRole: assignment.macro_role,
  };
};

const zeroTargetForMeal = (
  label: string,
  slotKey: CarbCycleMealTarget['slotKey'] = 'morning'
): CarbCycleMealTarget => ({
  slotKey,
  label,
  calories: 0,
  carbs: 0,
  protein: 0,
  fat: 0,
});

const buildFallbackMealPreviews = (
  assignments: MealPlanTemplateAssignment[],
  dayIndex: number
): KitchenMealPreview[] => {
  const dayAssignments = assignments.filter(
    (assignment) => assignment.day_of_week === dayIndex
  );
  const mealTypes = Array.from(
    new Map(
      dayAssignments.map((assignment) => [
        normalizeMealType(assignment.meal_type),
        assignment.meal_type,
      ])
    ).values()
  );

  return mealTypes.map((mealType, mealIndex) => {
    const items = dayAssignments
      .filter(
        (assignment) =>
          normalizeMealType(assignment.meal_type) ===
          normalizeMealType(mealType)
      )
      .map((assignment, assignmentIndex) =>
        assignmentToItem(assignment, mealIndex * 1000 + assignmentIndex)
      );

    return {
      key: `${dayIndex}-fallback-${normalizeMealType(mealType)}`,
      label: mealType,
      target: zeroTargetForMeal(mealType),
      items,
    };
  });
};

export const localDateString = (date: Date = new Date()): string =>
  [
    date.getFullYear(),
    formatTwoDigits(date.getMonth() + 1),
    formatTwoDigits(date.getDate()),
  ].join('-');

export const getActiveKitchenTemplate = (
  templates: KitchenPlanTemplate[] | undefined,
  todayDate: string
): KitchenPlanTemplate | undefined => {
  const activeTemplates = (templates ?? [])
    .filter((template) => template.is_active)
    .sort(
      (left, right) => getTemplateStartTime(right) - getTemplateStartTime(left)
    );

  return (
    activeTemplates.find((template) =>
      isWithinTemplateRange(template, todayDate)
    ) ?? activeTemplates[0]
  );
};

export const resolveDayTypeLabel = (meals: CarbCycleMealTarget[]): string => {
  const targetCarbs = meals.reduce((total, meal) => total + meal.carbs, 0);

  if (targetCarbs >= 200) return 'High Carb';
  if (targetCarbs >= 100) return 'Medium Carb';

  return 'Low Carb';
};

export const buildKitchenWeek = (
  template: KitchenPlanTemplate,
  selectedDate: string,
  todayDate: string
): KitchenWeekPreview => {
  const weekStart = getWeekMonday(selectedDate);
  const targetsByDay = normalizeTargets(template.macro_targets);

  const days = Array.from({ length: 7 }, (_, weekOffset): KitchenDayPreview => {
    const date = addDays(weekStart, weekOffset);
    const dateString = utcDateString(date);
    const dayIndex = date.getUTCDay();
    const meals = targetsByDay[dayIndex] ?? [];
    const hasMacroTargets = meals.length > 0;

    const mealPreviews = hasMacroTargets
      ? meals.map((target, mealIndex): KitchenMealPreview => {
          const items = template.assignments
            .filter(
              (assignment) =>
                assignment.day_of_week === dayIndex &&
                normalizeMealType(assignment.meal_type) ===
                  normalizeMealType(target.label)
            )
            .map((assignment, assignmentIndex) =>
              assignmentToItem(assignment, mealIndex * 1000 + assignmentIndex)
            );

          return {
            key: `${dayIndex}-${target.slotKey}-${target.label}`,
            label: target.label,
            target,
            items,
          };
        })
      : buildFallbackMealPreviews(template.assignments, dayIndex);

    return {
      dayIndex,
      date: dateString,
      weekdayLabel: WEEKDAY_LABELS[dayIndex]!,
      shortLabel: SHORT_WEEKDAY_LABELS[dayIndex]!,
      dayNumberLabel: formatTwoDigits(date.getUTCDate()),
      isToday: dateString === todayDate,
      isSelected: dateString === selectedDate,
      dayTypeLabel: hasMacroTargets ? resolveDayTypeLabel(meals) : 'Meal Plan',
      targetCalories: meals.reduce((total, meal) => total + meal.calories, 0),
      targetCarbs: meals.reduce((total, meal) => total + meal.carbs, 0),
      targetProtein: meals.reduce((total, meal) => total + meal.protein, 0),
      targetFat: meals.reduce((total, meal) => total + meal.fat, 0),
      meals: mealPreviews,
    };
  });

  return {
    template,
    selectedDate,
    todayDate,
    days,
  };
};
