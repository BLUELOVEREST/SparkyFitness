import { apiFetch } from './apiClient';
import type { ActiveMealPlanDay } from '../../types/mealPlan';

export const fetchActiveMealPlanDay = (
  date: string
): Promise<ActiveMealPlanDay> =>
  apiFetch<ActiveMealPlanDay>({
    endpoint: `/api/meal-plan-templates/active/day?date=${encodeURIComponent(date)}`,
    serviceName: 'Meal Plan Templates API',
    operation: 'fetch active meal plan day',
  });

export const logActiveMealPlanMealToDiary = (
  date: string,
  mealTypeId: string
): Promise<{ foodEntryMealId: string }> =>
  apiFetch<{ foodEntryMealId: string }>({
    endpoint: '/api/meal-plan-templates/active/log-meal-to-diary',
    serviceName: 'Meal Plan Templates API',
    operation: 'log planned meal to diary',
    method: 'POST',
    body: { date, mealTypeId },
  });
