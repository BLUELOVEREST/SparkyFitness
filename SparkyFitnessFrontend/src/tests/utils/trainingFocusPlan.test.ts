import type { WorkoutPlanFocusSession } from '@/types/workout';
import {
  buildTrainingFocusOptions,
  orderItemsByFirstDay,
  resolveTrainingFocusValue,
  setPrimaryTrainingFocusSession,
  updateTrainingFocusSession,
} from '@/utils/trainingFocusPlan';

const createSessions = (): WorkoutPlanFocusSession[] =>
  [0, 1].flatMap((day) =>
    (['morning', 'noon', 'afternoon', 'evening'] as const).map((slot) => ({
      day_of_week: day,
      time_slot: slot,
      training_focus: 'rest',
      is_primary: false,
    }))
  );

describe('trainingFocusPlan utils', () => {
  it('keeps primary training selection scoped to one day', () => {
    let sessions = createSessions();
    sessions = updateTrainingFocusSession(sessions, 0, 'morning', 'back');
    sessions = updateTrainingFocusSession(sessions, 1, 'evening', 'legs');
    sessions = setPrimaryTrainingFocusSession(sessions, 0, 'morning');
    sessions = setPrimaryTrainingFocusSession(sessions, 1, 'evening');

    expect(
      sessions.find(
        (session) =>
          session.day_of_week === 0 && session.time_slot === 'morning'
      )?.is_primary
    ).toBe(true);
    expect(
      sessions.find(
        (session) =>
          session.day_of_week === 1 && session.time_slot === 'evening'
      )?.is_primary
    ).toBe(true);
  });

  it('automatically marks the only active session in a day as primary', () => {
    const sessions = updateTrainingFocusSession(
      createSessions(),
      1,
      'afternoon',
      'chest'
    );

    expect(
      sessions.find(
        (session) =>
          session.day_of_week === 1 && session.time_slot === 'afternoon'
      )?.is_primary
    ).toBe(true);
  });

  it('orders display days from the configured first day of week', () => {
    expect(
      orderItemsByFirstDay(
        [
          { id: 0, name: 'Sunday' },
          { id: 1, name: 'Monday' },
          { id: 2, name: 'Tuesday' },
        ],
        1
      ).map((day) => day.name)
    ).toEqual(['Monday', 'Tuesday', 'Sunday']);
  });

  it('adds prior custom focus values to the option list without duplicating built-ins', () => {
    const options = buildTrainingFocusOptions([
      { training_focus: 'Core' },
      { training_focus: ' legs ' },
      { training_focus: 'Push Day' },
      { training_focus: 'core' },
      { training_focus: 'custom' },
      { training_focus: 'rest' },
    ]);

    expect(options.map((option) => option.value)).toEqual([
      'rest',
      'chest',
      'back',
      'legs',
      'shoulders',
      'arms',
      'cardio',
      'full_body',
      'Core',
      'Push Day',
      'custom',
    ]);
  });

  it('resolves custom input to the saved focus text and normalizes built-in labels', () => {
    expect(resolveTrainingFocusValue('custom', ' Core ')).toBe('Core');
    expect(resolveTrainingFocusValue('custom', 'Legs')).toBe('legs');
    expect(resolveTrainingFocusValue('custom', '   ')).toBe('rest');
    expect(resolveTrainingFocusValue('back', 'Core')).toBe('back');
  });
});
