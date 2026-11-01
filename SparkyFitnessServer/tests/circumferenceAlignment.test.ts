import { describe, expect, it } from 'vitest';
import {
  BODY_CIRCUMFERENCE_PARTS,
  updateCheckInMeasurementsRequestSchema,
} from '@workspace/shared';
import { resolveHandler } from '../services/healthDataHandlers.js';

const added = [
  'left_forearm',
  'right_forearm',
  'left_wrist',
  'right_wrist',
  'left_ankle',
  'right_ankle',
];

describe('built-in circumference alignment', () => {
  it('exposes all 18 native circumferences', () => {
    expect(BODY_CIRCUMFERENCE_PARTS).toHaveLength(18);
    expect(BODY_CIRCUMFERENCE_PARTS.map((p) => p.key)).toEqual(
      expect.arrayContaining(added)
    );
  });
  it.each(added)(
    'accepts partial and explicit-null %s patches without inventing other daily values',
    (key) => {
      expect(
        updateCheckInMeasurementsRequestSchema.parse({
          entry_date: '2026-10-31',
          [key]: 22.5,
        })
      ).toEqual({ entry_date: '2026-10-31', [key]: 22.5 });
      expect(
        updateCheckInMeasurementsRequestSchema.parse({
          entry_date: '2026-10-31',
          [key]: null,
        })
      ).toEqual({ entry_date: '2026-10-31', [key]: null });
      expect(resolveHandler(key)).toBeDefined();
    }
  );
});
