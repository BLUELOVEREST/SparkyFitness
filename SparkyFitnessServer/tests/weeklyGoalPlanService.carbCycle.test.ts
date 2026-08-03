import { beforeEach, describe, expect, it, vi } from 'vitest';
import goalRepository from '../models/goalRepository.js';
import mealMacroTargetRepository from '../models/mealMacroTargetRepository.js';
import { applyCarbCycleWeek } from '../services/weeklyGoalPlanService.js';

vi.mock('../models/goalRepository.js', () => ({
  default: {
    getGoalByDate: vi.fn(),
    getMostRecentGoalBeforeDate: vi.fn(),
    upsertGoal: vi.fn(),
  },
}));

vi.mock('../models/mealMacroTargetRepository.js', () => ({
  default: {
    replaceMealMacroTargetsForWeek: vi.fn(),
  },
}));

describe('weeklyGoalPlanService carb cycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(goalRepository.getGoalByDate).mockResolvedValue(undefined);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue(
      undefined
    );
    vi.mocked(goalRepository.upsertGoal).mockResolvedValue({});
    vi.mocked(
      mealMacroTargetRepository.replaceMealMacroTargetsForWeek
    ).mockResolvedValue([]);
  });

  it('applies carb cycle targets to seven daily goal rows', async () => {
    const result = await applyCarbCycleWeek('test-user-id', {
      weekStartDate: '2026-07-06',
      bodyWeightKg: 70,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
    });

    expect(result.days).toHaveLength(7);
    expect(goalRepository.upsertGoal).toHaveBeenCalledTimes(7);
    expect(goalRepository.upsertGoal).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user_id: 'test-user-id',
        goal_date: '2026-07-06',
        calories: 2104,
        carbs: 110.25,
        protein: 140,
        fat: 122.5,
        breakfast_percentage: 25,
        lunch_percentage: 25,
        dinner_percentage: 25,
        snacks_percentage: 25,
      })
    );
    expect(
      mealMacroTargetRepository.replaceMealMacroTargetsForWeek
    ).toHaveBeenCalledWith(
      'test-user-id',
      '2026-07-06',
      '2026-07-12',
      expect.any(Array)
    );
    const savedTargets = vi.mocked(
      mealMacroTargetRepository.replaceMealMacroTargetsForWeek
    ).mock.calls[0][3];
    expect(savedTargets).toHaveLength(21);
    expect(savedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal_date: '2026-07-06',
          slot_key: 'morning',
          label: 'Breakfast',
          carbs: 36.8,
          protein: 46.7,
          fat: 40.8,
          calories: 701,
        }),
        expect.objectContaining({
          goal_date: '2026-07-06',
          slot_key: 'noon',
          label: 'Lunch',
        }),
        expect.objectContaining({
          goal_date: '2026-07-06',
          slot_key: 'evening',
          label: 'Dinner',
        }),
        expect.objectContaining({
          goal_date: '2026-07-07',
          slot_key: 'morning',
          label: 'Breakfast',
        }),
      ])
    );
  });

  it('preserves existing non-macro goal fields when applying targets', async () => {
    vi.mocked(goalRepository.getGoalByDate).mockResolvedValue({
      water_goal_ml: 2800,
      saturated_fat: 12,
      breakfast_percentage: 30,
      lunch_percentage: 30,
      dinner_percentage: 30,
      snacks_percentage: 10,
      custom_meal_percentages: { pre_workout: 20 },
      custom_nutrients: { caffeine: 100 },
    });

    await applyCarbCycleWeek('test-user-id', {
      weekStartDate: '2026-07-06',
      bodyWeightKg: 70,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
    });

    expect(goalRepository.getGoalByDate).toHaveBeenCalledWith(
      'test-user-id',
      '2026-07-06'
    );
    expect(goalRepository.upsertGoal).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        water_goal_ml: 2800,
        saturated_fat: 12,
        breakfast_percentage: 30,
        lunch_percentage: 30,
        dinner_percentage: 30,
        snacks_percentage: 10,
        custom_meal_percentages: { pre_workout: 20 },
        custom_nutrients: { caffeine: 100 },
      })
    );
  });

  it('falls back to the current effective goal when no explicit day goal exists', async () => {
    vi.mocked(goalRepository.getGoalByDate).mockResolvedValue(undefined);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      water_goal_ml: 3200,
      dietary_fiber: 35,
      breakfast_percentage: 35,
      lunch_percentage: 30,
      dinner_percentage: 25,
      snacks_percentage: 10,
    });

    await applyCarbCycleWeek('test-user-id', {
      weekStartDate: '2026-07-06',
      bodyWeightKg: 70,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
    });

    expect(goalRepository.getMostRecentGoalBeforeDate).toHaveBeenCalledWith(
      'test-user-id',
      '2026-07-06'
    );
    expect(goalRepository.upsertGoal).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        water_goal_ml: 3200,
        dietary_fiber: 35,
        breakfast_percentage: 35,
        lunch_percentage: 30,
        dinner_percentage: 25,
        snacks_percentage: 10,
      })
    );
  });

  it('rejects API custom templates in phase one', async () => {
    await expect(
      applyCarbCycleWeek('test-user-id', {
        weekStartDate: '2026-07-06',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
        template: ['high', 'high', 'high', 'high', 'high', 'high', 'high'],
      })
    ).rejects.toThrow('template is not supported by this endpoint');
    expect(goalRepository.upsertGoal).not.toHaveBeenCalled();
  });
});
