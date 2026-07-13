import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mealPlanTemplateRepository from '../models/mealPlanTemplateRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('mealPlanTemplateRepository macro targets', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('persists carb-cycle meal macro targets on create', async () => {
    const macroTargets = {
      1: [
        {
          slotKey: 'morning',
          label: 'Pre-Workout',
          calories: 346,
          carbs: 51.5,
          protein: 35,
          fat: 0,
        },
      ],
    };

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
      .mockResolvedValueOnce({}) // COMMIT
      .mockResolvedValueOnce({
        rows: [{ id: 'template-1', macro_targets: macroTargets }],
      });

    await mealPlanTemplateRepository.createMealPlanTemplate({
      user_id: 'user-1',
      plan_name: 'Carb Cycle 2026-07-06',
      start_date: '2026-07-06',
      end_date: '2026-07-12',
      is_active: false,
      macro_targets: macroTargets,
      assignments: [],
    });

    const insertCall = mockClient.query.mock.calls[1];
    expect(insertCall[0]).toContain('macro_targets');
    expect(insertCall[1][6]).toEqual(JSON.stringify(macroTargets));
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('deactivates only the current user meal plan templates', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 2 });

    await mealPlanTemplateRepository.deactivateAllMealPlanTemplates('user-1');

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1'),
      ['user-1']
    );
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
