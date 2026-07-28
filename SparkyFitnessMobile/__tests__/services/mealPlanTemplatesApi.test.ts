jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '../../src/services/api/apiClient';
import {
  createMealPlanTemplate,
  deleteMealPlanTemplate,
  fetchActiveMealPlanDay,
  fetchMealPlanTemplates,
  logActiveMealPlanMealToDiary,
  updateMealPlanTemplate,
} from '../../src/services/api/mealPlanTemplatesApi';

describe('mealPlanTemplatesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches active meal plan day for a date', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      mode: 'carbCycle',
      date: '2026-07-15',
      meals: [],
    });

    await expect(fetchActiveMealPlanDay('2026-07-15')).resolves.toEqual({
      mode: 'carbCycle',
      date: '2026-07-15',
      meals: [],
    });

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates/active/day?date=2026-07-15',
      serviceName: 'Meal Plan Templates API',
      operation: 'fetch active meal plan day',
    });
  });

  it('fetches meal plan templates', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce([
      {
        id: 'template-1',
        plan_name: 'Carb Cycle',
        start_date: '2026-07-13',
        end_date: null,
        is_active: true,
        macro_targets: {},
        assignments: [],
      },
    ]);

    await expect(fetchMealPlanTemplates()).resolves.toEqual([
      {
        id: 'template-1',
        plan_name: 'Carb Cycle',
        start_date: '2026-07-13',
        end_date: null,
        is_active: true,
        macro_targets: {},
        assignments: [],
      },
    ]);

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates',
      serviceName: 'Meal Plan Templates API',
      operation: 'fetch meal plan templates',
    });
  });

  it('creates a meal plan template', async () => {
    const payload = {
      plan_name: 'Carb Cycle',
      description: 'Mobile draft',
      start_date: '2026-07-13',
      end_date: null,
      is_active: true,
      macro_targets: {},
      assignments: [],
    };
    (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'template-1', ...payload });

    await expect(createMealPlanTemplate(payload)).resolves.toEqual({
      id: 'template-1',
      ...payload,
    });

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates',
      serviceName: 'Meal Plan Templates API',
      operation: 'create meal plan template',
      method: 'POST',
      body: {
        ...payload,
        day_presets: [],
      },
    });
  });

  it('updates a meal plan template', async () => {
    const payload = {
      id: 'template-1',
      plan_name: 'Carb Cycle Updated',
      start_date: '2026-07-13',
      end_date: null,
      is_active: true,
      macro_targets: {},
      assignments: [],
    };
    (apiFetch as jest.Mock).mockResolvedValueOnce(payload);

    await expect(updateMealPlanTemplate(payload)).resolves.toEqual(payload);

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates/template-1',
      serviceName: 'Meal Plan Templates API',
      operation: 'update meal plan template',
      method: 'PUT',
      body: payload,
    });
  });

  it('deletes a meal plan template', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce(undefined);

    await expect(deleteMealPlanTemplate('template-1', '2026-07-16')).resolves.toBeUndefined();

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates/template-1?currentClientDate=2026-07-16',
      serviceName: 'Meal Plan Templates API',
      operation: 'delete meal plan template',
      method: 'DELETE',
    });
  });

  it('logs a planned meal to diary', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      foodEntryMealId: 'entry-meal-1',
    });

    await expect(
      logActiveMealPlanMealToDiary('2026-07-15', 'meal-type-1')
    ).resolves.toEqual({ foodEntryMealId: 'entry-meal-1' });

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates/active/log-meal-to-diary',
      serviceName: 'Meal Plan Templates API',
      operation: 'log planned meal to diary',
      method: 'POST',
      body: { date: '2026-07-15', mealTypeId: 'meal-type-1' },
    });
  });
});
