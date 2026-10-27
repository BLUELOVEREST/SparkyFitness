import { createInstance } from 'i18next';
import { BUILT_IN_TRAINING_FOCUS_OPTIONS } from '@workspace/shared';
import { getTrainingFocusLabel } from '../../src/utils/trainingFocusPlan';
import en from '../../src/localization/locales/en/translation.json';

describe('training focus presentation labels', () => {
  it('provides catalog-backed English fallbacks for every built-in and the custom command', async () => {
    const instance = createInstance();
    await instance.init({ lng: 'en', resources: { en: { translation: en } } });
    for (const option of [
      ...BUILT_IN_TRAINING_FOCUS_OPTIONS,
      { value: 'custom', label: 'Custom' },
    ]) {
      expect(
        getTrainingFocusLabel(option.value, option.label, instance.t)
      ).toBe(option.label);
    }
  });

  it('uses the active translator for built-ins but leaves user labels literal', async () => {
    const instance = createInstance();
    await instance.init({
      lng: 'en',
      resources: {
        en: {
          translation: {
            workoutPlan: {
              focusLabels: {
                fullBody: 'Translated full body',
                chest: 'Translated chest',
              },
            },
          },
        },
      },
    });
    expect(getTrainingFocusLabel('full_body', 'Full Body', instance.t)).toBe(
      'Translated full body'
    );
    expect(getTrainingFocusLabel('chest', 'Chest', instance.t)).toBe(
      'Translated chest'
    );
    expect(getTrainingFocusLabel('Push Day', 'Push Day', instance.t)).toBe(
      'Push Day'
    );
    expect(getTrainingFocusLabel('Core', 'Core', instance.t)).toBe('Core');
  });
});
