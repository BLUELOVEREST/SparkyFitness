import { useQueries } from '@tanstack/react-query';
import { fetchActiveMealPlanDay } from '../services/api/mealPlanTemplatesApi';
import type { ActiveMealPlanDay } from '../types/mealPlan';
import { activeMealPlanDayQueryKey } from './queryKeys';

interface UseActiveMealPlanWeekOptions {
  dates: string[];
  enabled?: boolean;
}

export function useActiveMealPlanWeek({
  dates,
  enabled = true,
}: UseActiveMealPlanWeekOptions) {
  const results = useQueries({
    queries: dates.map((date) => ({
      queryKey: activeMealPlanDayQueryKey(date),
      queryFn: () => fetchActiveMealPlanDay(date),
      enabled,
    })),
  });

  return {
    activeMealPlanDays: results
      .map((result) => result.data)
      .filter((day): day is ActiveMealPlanDay => Boolean(day)),
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
  };
}
