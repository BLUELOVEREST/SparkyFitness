import { apiFetch } from './apiClient';
import type {
  ActiveMealPlanDay,
  MealPlanTemplate,
  SaveMealPlanTemplatePayload,
} from '../../types/mealPlan';

export const fetchMealPlanTemplates = (): Promise<MealPlanTemplate[]> =>
  apiFetch<MealPlanTemplate[]>({
    endpoint: '/api/meal-plan-templates',
    serviceName: 'Meal Plan Templates API',
    operation: 'fetch meal plan templates',
  });

export const createMealPlanTemplate = (
  payload: SaveMealPlanTemplatePayload
): Promise<MealPlanTemplate> => {
  const { assignments, ...rest } = payload;
  return apiFetch<MealPlanTemplate>({
    endpoint: '/api/meal-plan-templates',
    serviceName: 'Meal Plan Templates API',
    operation: 'create meal plan template',
    method: 'POST',
    body: {
      ...rest,
      assignments,
      day_presets: assignments,
    },
  });
};

export const updateMealPlanTemplate = (
  payload: SaveMealPlanTemplatePayload & { id: string }
): Promise<MealPlanTemplate> =>
  apiFetch<MealPlanTemplate>({
    endpoint: `/api/meal-plan-templates/${encodeURIComponent(payload.id)}`,
    serviceName: 'Meal Plan Templates API',
    operation: 'update meal plan template',
    method: 'PUT',
    body: payload,
  });

export const deleteMealPlanTemplate = (
  templateId: string,
  currentClientDate?: string
): Promise<void> => {
  const query = currentClientDate
    ? `?currentClientDate=${encodeURIComponent(currentClientDate)}`
    : '';
  return apiFetch<void>({
    endpoint: `/api/meal-plan-templates/${encodeURIComponent(templateId)}${query}`,
    serviceName: 'Meal Plan Templates API',
    operation: 'delete meal plan template',
    method: 'DELETE',
  });
};

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
