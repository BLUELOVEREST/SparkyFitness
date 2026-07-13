import { describe, expect, it } from 'vitest';
import {
  calculateCarbCycleWeek,
  DEFAULT_CARB_CYCLE_TEMPLATE,
} from '../services/carbCyclePlannerService.js';

describe('carbCyclePlannerService', () => {
  it('distributes weekly macros across fixed high medium and low carb days', () => {
    const result = calculateCarbCycleWeek({
      weekStartDate: '2026-07-06',
      bodyWeightKg: 70,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
      template: DEFAULT_CARB_CYCLE_TEMPLATE,
    });

    expect(result.days.map((day) => [day.date, day.dayType])).toEqual([
      ['2026-07-06', 'low'],
      ['2026-07-07', 'medium'],
      ['2026-07-08', 'medium'],
      ['2026-07-09', 'high'],
      ['2026-07-10', 'low'],
      ['2026-07-11', 'high'],
      ['2026-07-12', 'medium'],
    ]);

    expect(result.days.find((day) => day.dayType === 'high')).toMatchObject({
      carbs: 367.5,
      protein: 140,
      fat: 36.75,
      calories: 2361,
    });

    expect(result.days.find((day) => day.dayType === 'medium')).toMatchObject({
      carbs: 171.5,
      protein: 140,
      fat: 57.17,
      calories: 1761,
    });

    expect(result.days.find((day) => day.dayType === 'low')).toMatchObject({
      carbs: 110.25,
      protein: 140,
      fat: 122.5,
      calories: 2104,
    });

    expect(result.weekTotals).toEqual({
      carbs: 1470,
      protein: 980,
      fat: 490.01,
      calories: 14213,
    });
  });

  it('builds per-meal macro targets from the primary training slot', () => {
    const result = calculateCarbCycleWeek({
      weekStartDate: '2026-07-06',
      bodyWeightKg: 70,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
      template: DEFAULT_CARB_CYCLE_TEMPLATE,
      trainingSlots: [
        'rest',
        'morning',
        'noon',
        'afternoon',
        'evening',
        'rest',
        'rest',
      ],
    });

    expect(result.days[0].meals.map((meal) => meal.label)).toEqual([
      'Breakfast',
      'Lunch',
      'Afternoon Meal',
      'Dinner',
    ]);
    expect(result.days[0].meals).toEqual([
      {
        slotKey: 'morning',
        label: 'Breakfast',
        carbs: 27.6,
        protein: 35,
        fat: 30.6,
        calories: 526,
      },
      {
        slotKey: 'noon',
        label: 'Lunch',
        carbs: 27.6,
        protein: 35,
        fat: 30.6,
        calories: 526,
      },
      {
        slotKey: 'afternoon',
        label: 'Afternoon Meal',
        carbs: 27.6,
        protein: 35,
        fat: 30.6,
        calories: 526,
      },
      {
        slotKey: 'evening',
        label: 'Dinner',
        carbs: 27.4,
        protein: 35,
        fat: 30.7,
        calories: 526,
      },
    ]);

    expect(result.days[1].meals.map((meal) => meal.label)).toEqual([
      'Pre-Workout',
      'Post-Workout',
      'Lunch',
      'Dinner',
    ]);
    expect(result.days[1].meals).toEqual([
      {
        slotKey: 'morning',
        label: 'Pre-Workout',
        carbs: 51.5,
        protein: 35,
        fat: 0,
        calories: 346,
      },
      {
        slotKey: 'noon',
        label: 'Post-Workout',
        carbs: 68.6,
        protein: 42,
        fat: 5.7,
        calories: 494,
      },
      {
        slotKey: 'afternoon',
        label: 'Lunch',
        carbs: 25.7,
        protein: 31.5,
        fat: 25.7,
        calories: 460,
      },
      {
        slotKey: 'evening',
        label: 'Dinner',
        carbs: 25.7,
        protein: 31.5,
        fat: 25.8,
        calories: 461,
      },
    ]);

    expect(result.days[2].meals.map((meal) => meal.label)).toEqual([
      'Breakfast',
      'Pre-Workout',
      'Post-Workout',
      'Dinner',
    ]);
    expect(result.days[3].meals.map((meal) => meal.label)).toEqual([
      'Breakfast',
      'Lunch',
      'Pre-Workout',
      'Post-Workout',
    ]);
    expect(result.days[4].meals.map((meal) => meal.label)).toEqual([
      'Breakfast',
      'Lunch',
      'Pre-Workout',
      'Post-Workout',
    ]);
  });

  it('rejects non-positive body weight and macro inputs', () => {
    const validInput = {
      weekStartDate: '2026-07-06',
      bodyWeightKg: 70,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
      template: DEFAULT_CARB_CYCLE_TEMPLATE,
    };

    expect(() =>
      calculateCarbCycleWeek({
        ...validInput,
        bodyWeightKg: 0,
      })
    ).toThrow('bodyWeightKg must be greater than 0');

    expect(() =>
      calculateCarbCycleWeek({
        ...validInput,
        carbsPerKg: 0,
      })
    ).toThrow('carbsPerKg must be greater than 0');

    expect(() =>
      calculateCarbCycleWeek({
        ...validInput,
        proteinPerKg: -1,
      })
    ).toThrow('proteinPerKg must be greater than 0');

    expect(() =>
      calculateCarbCycleWeek({
        ...validInput,
        fatPerKg: Number.NaN,
      })
    ).toThrow('fatPerKg must be greater than 0');
  });

  it('rejects invalid week start dates', () => {
    expect(() =>
      calculateCarbCycleWeek({
        weekStartDate: '2026-07-06',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
        template: DEFAULT_CARB_CYCLE_TEMPLATE,
      })
    ).not.toThrow();

    expect(() =>
      calculateCarbCycleWeek({
        weekStartDate: '2026-2-6',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
        template: DEFAULT_CARB_CYCLE_TEMPLATE,
      })
    ).toThrow('weekStartDate must be a valid date');

    expect(() =>
      calculateCarbCycleWeek({
        weekStartDate: '2026-02-30',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
        template: DEFAULT_CARB_CYCLE_TEMPLATE,
      })
    ).toThrow('weekStartDate must be a valid date');
  });
});
