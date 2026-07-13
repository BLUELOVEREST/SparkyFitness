import { describe, expect, it } from 'vitest';
import { normalizeTrainingFocusSessions } from '../services/workoutPlanTemplateService.js';

describe('training focus workout plans', () => {
  it('allows multiple training sessions with exactly one primary session', () => {
    const sessions = normalizeTrainingFocusSessions([
      {
        day_of_week: 1,
        time_slot: 'morning',
        training_focus: 'back',
        is_primary: false,
      },
      {
        day_of_week: 1,
        time_slot: 'evening',
        training_focus: 'legs',
        is_primary: true,
      },
    ]);

    expect(sessions.filter((session) => session.day_of_week === 1)).toEqual([
      {
        day_of_week: 1,
        time_slot: 'morning',
        training_focus: 'back',
        is_primary: false,
      },
      {
        day_of_week: 1,
        time_slot: 'noon',
        training_focus: 'rest',
        is_primary: false,
      },
      {
        day_of_week: 1,
        time_slot: 'afternoon',
        training_focus: 'rest',
        is_primary: false,
      },
      {
        day_of_week: 1,
        time_slot: 'evening',
        training_focus: 'legs',
        is_primary: true,
      },
    ]);
  });

  it('rejects a training day with two primary sessions', () => {
    expect(() =>
      normalizeTrainingFocusSessions([
        {
          day_of_week: 2,
          time_slot: 'morning',
          training_focus: 'chest',
          is_primary: true,
        },
        {
          day_of_week: 2,
          time_slot: 'evening',
          training_focus: 'arms',
          is_primary: true,
        },
      ])
    ).toThrow('Training days must have exactly one primary training session.');
  });

  it('rejects a training day without a primary session', () => {
    expect(() =>
      normalizeTrainingFocusSessions([
        {
          day_of_week: 3,
          time_slot: 'afternoon',
          training_focus: 'shoulders',
          is_primary: false,
        },
      ])
    ).toThrow('Training days must have exactly one primary training session.');
  });
});
