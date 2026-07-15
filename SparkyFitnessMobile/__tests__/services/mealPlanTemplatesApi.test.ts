jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '../../src/services/api/apiClient';
import {
  fetchActiveMealPlanDay,
  logActiveMealPlanMealToDiary,
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
