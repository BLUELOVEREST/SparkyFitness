import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  presetSessionResponseSchema,
  workoutCalories,
  workoutDurationMinutes,
} from '@workspace/shared';
import { extractExerciseStats } from '../services/calorieBalanceService.js';
import { workoutTotalsRowsSql } from '../utils/workoutTotalsSql.js';
import goalService from '../services/goalService.js';
import goalRepository from '../models/goalRepository.js';
import mealMacroTargetRepository from '../models/mealMacroTargetRepository.js';
import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import bmrService from '../services/bmrService.js';
import adaptiveTdeeService from '../services/AdaptiveTdeeService.js';

vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../models/goalRepository.js');
vi.mock('../models/mealMacroTargetRepository.js');
vi.mock('../models/weeklyGoalPlanRepository.js');
vi.mock('../models/goalPresetRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../models/exerciseEntry.js');
vi.mock('../services/bmrService.js');
vi.mock('../services/AdaptiveTdeeService.js');

const userId = 'user-1';
const date = '2026-08-21';

describe('merged workout calorie accounting', () => {
  const nativeWorkout = () =>
    presetSessionResponseSchema.parse({
      type: 'preset',
      id: 'parent',
      entry_date: date,
      workout_preset_id: null,
      name: 'Workout',
      description: null,
      notes: null,
      source: 'manual',
      total_duration_minutes: 20,
      source_summary: null,
      activity_details: [],
      exercises: [0, 125, null].map((applied, index) => ({
        id: `child-${index}`,
        exercise_id: null,
        duration_minutes: 10,
        calories_burned: 100,
        calories_applied: applied,
        entry_date: date,
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: 'manual',
        sets: [],
        exercise_snapshot: null,
        activity_details: [],
        superset_group: null,
      })),
    });

  it('uses applied native calories, including zero, without counting estimates twice', () => {
    const workout = nativeWorkout();
    expect(workoutCalories(workout)).toBe(225);
    expect(extractExerciseStats([workout]).otherCalories).toBe(225);
  });

  it.each([123, 0, null])(
    'keeps source totals authoritative over applied child calories: %s',
    (calories) => {
      const workout = nativeWorkout();
      workout.source_summary = {
        calories_kcal: calories,
        duration_seconds: 600,
      };
      expect(workoutCalories(workout)).toBe(calories);
      expect(workoutDurationMinutes(workout)).toBe(10);
      expect(extractExerciseStats([workout]).otherCalories).toBe(calories ?? 0);
      workout.exercises = [];
      expect(workoutCalories(workout)).toBe(calories);
      expect(workoutDurationMinutes(workout)).toBe(10);
    }
  );

  it('projects applied calories only for non-authoritative child observations', () => {
    expect(workoutTotalsRowsSql).toContain(
      'CASE WHEN p.source_summary IS NULL THEN ee.calories_applied END AS calories_applied'
    );
    expect(workoutTotalsRowsSql).toContain(
      "(source_summary->>'calories_kcal')::numeric,\n    NULL::numeric,"
    );
  });
});

describe('goalService calorie safety floor preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      mealMacroTargetRepository.getMealMacroTargetsForRange
    ).mockResolvedValue([]);
    vi.mocked(
      weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange
    ).mockResolvedValue([]);
    vi.mocked(goalRepository.getGoalsInRange).mockResolvedValue([]);
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 2000,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(userRepository.getUserProfile).mockResolvedValue({
      date_of_birth: '1990-01-01',
      gender: 'female',
    });
    vi.mocked(
      measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate
    ).mockResolvedValue({
      entry_date: date,
      weight: 88,
      height: 175,
    });
    vi.mocked(
      measurementRepository.getCheckInMeasurementsByDateRange
    ).mockResolvedValue([]);
    vi.mocked(bmrService.calculateBmr).mockReturnValue(1642);
    vi.mocked(adaptiveTdeeService.calculateAdaptiveTdeeRange).mockResolvedValue(
      {
        [date]: {
          tdee: 1606,
          confidence: 'HIGH',
          isFallback: false,
          daysOfData: 60,
          lastCalculated: date,
        },
      }
    );
  });

  it('allows the measured target below RMR when a lower custom floor is configured', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'fixed',
      goal_mode: 'maintain',
      goal_mode_calculation_method: 'adaptive',
      goal_mode_custom_percentage: 0,
      activity_level: 'not_much',
      bmr_algorithm: 'Mifflin-St Jeor',
      calorie_safety_floor_mode: 'custom',
      calorie_safety_floor_value: 1200,
      timezone: 'Europe/Berlin',
    });

    const result = await goalService.getUserGoalsForRange(
      userId,
      date,
      date,
      true
    );

    expect((result[date] as { calories: number }).calories).toBe(1606);
  });

  it('preserves the legacy 1200 kcal floor for the standard adaptive adjustment path', async () => {
    vi.mocked(goalRepository.getMostRecentGoalBeforeDate).mockResolvedValue({
      calories: 1000,
      protein_percentage: null,
      carbs_percentage: null,
      fat_percentage: null,
    });
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      calorie_goal_adjustment_mode: 'adaptive',
      goal_mode: 'maintain',
      goal_mode_calculation_method: 'manual',
      goal_mode_custom_percentage: 0,
      activity_level: 'not_much',
      bmr_algorithm: 'Mifflin-St Jeor',
      calorie_safety_floor_mode: 'standard',
      calorie_safety_floor_value: 1200,
      timezone: 'Europe/Berlin',
    });

    const result = await goalService.getUserGoalsForRange(
      userId,
      date,
      date,
      true
    );

    expect((result[date] as { calories: number }).calories).toBe(1200);
  });
});
