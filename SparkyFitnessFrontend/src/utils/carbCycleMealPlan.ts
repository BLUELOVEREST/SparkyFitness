import type { CarbCycleMealTarget, CarbCycleWeekResult } from '@/types/goals';
import type { MealPlanTemplate } from '@/types/meal';

export interface CarbCycleMealPlanDraft {
  template: Partial<MealPlanTemplate>;
  mealTargetsByDay: Record<number, CarbCycleMealTarget[]>;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function buildCarbCycleMealPlanDraft(
  preview: CarbCycleWeekResult
): CarbCycleMealPlanDraft {
  const mealTargetsByDay = preview.days.reduce<
    Record<number, CarbCycleMealTarget[]>
  >((acc, day) => {
    acc[dayOfWeek(day.date)] = day.meals;
    return acc;
  }, {});

  return {
    template: {
      plan_name: `Carb Cycle ${preview.weekStartDate}`,
      description:
        'Generated from carb cycle targets. Add foods or meals to each target meal.',
      start_date: preview.weekStartDate,
      end_date: addDays(preview.weekStartDate, 6),
      is_active: false,
      assignments: [],
    },
    mealTargetsByDay,
  };
}
