import { describe, expect, it } from 'vitest';
import {
  sparkyGymDomainEventSchema,
  sparkyGymEventSchema,
  sparkyGymScheduleSummaryPayloadSchema,
} from '@workspace/shared';

const payload = {
  name: 'Next week',
  timezone: 'Asia/Shanghai',
  week_start: 1,
  effective_from: '2026-11-02',
  effective_until: '2026-11-08',
  days: [
    {
      weekday: 2,
      slots: [
        { time_slot: 'morning', activity: 'chest', is_main: true },
        { time_slot: 'evening', activity: 'football', is_main: false },
      ],
    },
  ],
};
const event = {
  version: 1,
  event_id: '11111111-1111-4111-8111-111111111111',
  connection_id: '22222222-2222-4222-8222-222222222222',
  producer: 'sparkyfitness',
  resource: 'schedule_summary',
  entity_id: '42',
  revision: 1,
  source_cursor: 1,
  operation: 'upsert',
  occurred_at: '2026-10-30T02:00:00.000Z',
  payload,
};

describe('SF-owned daily training hint contract', () => {
  it('accepts dated bucket-based hints without routine or session references', () => {
    expect(sparkyGymDomainEventSchema.safeParse(event).success).toBe(true);
  });
  it('denies openGym as the producer of weekly training intent', () => {
    expect(
      sparkyGymEventSchema.safeParse({ ...event, producer: 'opengym' }).success
    ).toBe(false);
    expect(
      sparkyGymDomainEventSchema.safeParse({ ...event, producer: 'opengym' })
        .success
    ).toBe(false);
  });
  it('rejects invented clocks, unknown buckets, duplicate buckets and ambiguous main', () => {
    for (const slots of [
      [
        {
          slot_id: 'one',
          time_of_day: '09:00',
          activity: 'chest',
          is_main: true,
        },
      ],
      [{ time_slot: 'night', activity: 'chest', is_main: true }],
      [
        { time_slot: 'morning', activity: 'chest', is_main: true },
        { time_slot: 'morning', activity: 'football', is_main: false },
      ],
      [{ time_slot: 'morning', activity: 'chest', is_main: false }],
      [
        { time_slot: 'morning', activity: 'chest', is_main: true },
        { time_slot: 'evening', activity: 'football', is_main: true },
      ],
    ]) {
      expect(
        sparkyGymScheduleSummaryPayloadSchema.safeParse({
          ...payload,
          days: [{ weekday: 2, slots }],
        }).success
      ).toBe(false);
    }
  });
  it('allows explicit rest and rejects invalid ranges and foreign linkage fields', () => {
    expect(
      sparkyGymScheduleSummaryPayloadSchema.safeParse({
        ...payload,
        days: [{ weekday: 2, slots: [] }],
      }).success
    ).toBe(true);
    expect(
      sparkyGymScheduleSummaryPayloadSchema.safeParse({
        ...payload,
        effective_until: '2026-11-01',
      }).success
    ).toBe(false);
    expect(
      sparkyGymScheduleSummaryPayloadSchema.safeParse({
        ...payload,
        workout_id: 'must-not-link',
      }).success
    ).toBe(false);
  });
});
