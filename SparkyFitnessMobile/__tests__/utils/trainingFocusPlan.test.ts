import {
  buildDefaultFocusSessions,
  buildTrainingFocusOptions,
  resolveTrainingFocusValue,
  setPrimaryTrainingFocusSession,
  updateTrainingFocusSession,
  validateTrainingFocusSessions,
} from '../../src/utils/trainingFocusPlan';

describe('trainingFocusPlan utils', () => {
  it('builds four rest slots for each weekday', () => {
    const sessions = buildDefaultFocusSessions();

    expect(sessions).toHaveLength(28);
    expect(sessions.filter(session => session.day_of_week === 1)).toEqual([
      {
        day_of_week: 1,
        time_slot: 'morning',
        training_focus: 'rest',
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
        training_focus: 'rest',
        is_primary: false,
      },
    ]);
  });

  it('auto-selects main when a day has exactly one training session', () => {
    const sessions = updateTrainingFocusSession(
      buildDefaultFocusSessions(),
      1,
      'morning',
      'back',
    );

    expect(
      sessions.find(
        session => session.day_of_week === 1 && session.time_slot === 'morning',
      )?.is_primary,
    ).toBe(true);
  });

  it('requires a main session when a day has multiple training sessions', () => {
    const sessions = buildDefaultFocusSessions()
      .map(session =>
        session.day_of_week === 1 && session.time_slot === 'morning'
          ? { ...session, training_focus: 'back' }
          : session,
      )
      .map(session =>
        session.day_of_week === 1 && session.time_slot === 'noon'
          ? { ...session, training_focus: 'legs' }
          : session,
      );

    expect(validateTrainingFocusSessions(sessions)).toEqual({
      valid: false,
      message: 'Monday must have exactly one main training session.',
    });
  });

  it('sets only one primary session per day', () => {
    const sessions = updateTrainingFocusSession(
      updateTrainingFocusSession(
        buildDefaultFocusSessions(),
        1,
        'morning',
        'back',
      ),
      1,
      'noon',
      'legs',
    );
    const updated = setPrimaryTrainingFocusSession(sessions, 1, 'noon');

    expect(
      updated.filter(
        session => session.day_of_week === 1 && session.is_primary,
      ),
    ).toEqual([
      {
        day_of_week: 1,
        time_slot: 'noon',
        training_focus: 'legs',
        is_primary: true,
      },
    ]);
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

    expect(options.map(option => option.value)).toEqual([
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
