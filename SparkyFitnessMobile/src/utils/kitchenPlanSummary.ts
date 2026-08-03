import type { ActiveMealPlanDay, ActiveMealPlanDayMeal } from '../types/mealPlan';

export interface KitchenIngredientSummaryItem {
  key: string;
  name: string;
  amountLabel: string;
  mealLabels: string[];
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDayLabel(date: string) {
  return dayNames[new Date(`${date}T00:00:00.000Z`).getUTCDay()] ?? date;
}

function summarizeMealItems(
  meals: ActiveMealPlanDayMeal[],
  formatMealLabel: (meal: ActiveMealPlanDayMeal) => string,
) {
  const grouped = new Map<
    string,
    {
      name: string;
      unit?: string;
      quantity: number;
      amountLabel?: string;
      mealLabels: string[];
    }
  >();

  for (const meal of meals) {
    const mealLabel = formatMealLabel(meal);
    for (const item of meal.items) {
      const hasStructuredAmount =
        typeof item.quantity === 'number' &&
        Number.isFinite(item.quantity) &&
        item.unit != null &&
        item.unit.trim().length > 0;
      const unit = hasStructuredAmount ? item.unit!.trim() : undefined;
      const key = hasStructuredAmount
        ? `${item.name}|${unit}`
        : `${item.name}|${item.amountLabel}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.quantity += hasStructuredAmount ? item.quantity! : 0;
        if (!existing.mealLabels.includes(mealLabel)) {
          existing.mealLabels.push(mealLabel);
        }
        continue;
      }

      grouped.set(key, {
        name: item.name,
        unit,
        quantity: hasStructuredAmount ? item.quantity! : 0,
        amountLabel: hasStructuredAmount ? undefined : item.amountLabel,
        mealLabels: [mealLabel],
      });
    }
  }

  return Array.from(grouped.entries()).map(([key, item]) => ({
    key,
    name: item.name,
    amountLabel: item.unit
      ? `${formatQuantity(item.quantity)} ${item.unit}`
      : item.amountLabel ?? '',
    mealLabels: item.mealLabels,
  }));
}

export function buildKitchenIngredientSummary(
  meals: ActiveMealPlanDayMeal[],
): KitchenIngredientSummaryItem[] {
  return summarizeMealItems(meals, (meal) => meal.label);
}

export function buildKitchenWeeklyIngredientSummary(
  days: ActiveMealPlanDay[],
): KitchenIngredientSummaryItem[] {
  const meals = days.flatMap((day) =>
    day.mode === 'carbCycle'
      ? day.meals
          .filter((meal) => meal.items.length > 0)
          .map((meal) => ({
            ...meal,
            label: `${getDayLabel(day.date)} ${meal.label}`,
          }))
      : [],
  );

  return summarizeMealItems(meals, (meal) => meal.label);
}
