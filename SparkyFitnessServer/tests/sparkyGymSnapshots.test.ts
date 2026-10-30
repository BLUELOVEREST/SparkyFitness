import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  membershipHash,
  selectCurrentBodyItems,
} from '../integrations/opengym/snapshots.js';
import type { BodySnapshotItem } from '../models/sparkyGymRepository.js';

describe('watermarked source snapshots', () => {
  it('hashes unique typed identities in UTF-8 byte order, independent of insertion order', () => {
    const items = [
      { resource: 'workout', entity_id: '乙' },
      { resource: 'exercise', entity_id: 'x' },
      { resource: 'workout', entity_id: 'a' },
      { resource: 'workout', entity_id: 'a' },
    ];
    const expected = createHash('sha256')
      .update('exercise\0x\nworkout\0a\nworkout\0乙\n')
      .digest('hex');
    expect(membershipHash(items)).toBe(expected);
    expect(membershipHash([...items].reverse())).toBe(expected);
    expect(membershipHash([])).toBe(createHash('sha256').digest('hex'));
  });
  it('current-only includes latest known samples, even without a measurement today', () => {
    const items: BodySnapshotItem[] = [
      {
        resource: 'body_definition',
        entity_id: 'weight',
        payload: { metric_id: 'weight' },
      },
      {
        resource: 'body_measurement',
        entity_id: 'old',
        payload: { metric_id: 'weight', date: '2026-10-01', measured_at: null },
      },
      {
        resource: 'body_measurement',
        entity_id: 'new',
        payload: { metric_id: 'weight', date: '2026-10-02', measured_at: null },
      },
      {
        resource: 'body_measurement',
        entity_id: 'a',
        payload: {
          metric_id: 'custom:x',
          date: '2026-10-02',
          measured_at: '2026-10-02T02:00:00.000Z',
        },
      },
      {
        resource: 'body_measurement',
        entity_id: 'b',
        payload: {
          metric_id: 'custom:x',
          date: '2026-10-02',
          measured_at: '2026-10-02T04:00:00.000Z',
        },
      },
      {
        resource: 'body_goal',
        entity_id: 'target_weight',
        payload: { value: 70 },
      },
      {
        resource: 'schedule_summary',
        entity_id: '42',
        payload: { name: 'Next week', effective_from: '2026-11-02' },
      },
    ];
    expect(
      selectCurrentBodyItems(items)
        .map((item) => item.entity_id)
        .sort()
    ).toEqual(['42', 'b', 'new', 'target_weight', 'weight']);
    expect(items).toHaveLength(7);
  });
});
