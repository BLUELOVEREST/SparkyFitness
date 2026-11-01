import type { TFunction } from 'i18next';
import { EXTRA_BODY_CIRCUMFERENCE_PARTS } from '@workspace/shared';
import { circumferenceLabel } from '../../src/utils/circumferenceLabels';

test.each(EXTRA_BODY_CIRCUMFERENCE_PARTS)(
  'translates $key using its stable key and English fallback',
  ({ key, label }) => {
    const translate = jest.fn(
      (_key: string, options: { defaultValue: string }) => options.defaultValue
    );
    expect(circumferenceLabel(key, translate as unknown as TFunction)).toBe(
      label
    );
    expect(translate).toHaveBeenCalledWith(`measurements.fields.${key}`, {
      defaultValue: label,
    });
  }
);
