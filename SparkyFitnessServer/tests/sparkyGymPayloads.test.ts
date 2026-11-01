import { describe, expect, it } from 'vitest';
import * as contracts from '../../shared/src/schemas/api/SparkyGym.api.zod.ts';
import * as shared from '../../shared/src/index.ts';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = { version: 1, native: { rounds: [1, null, 'drop'] } };
const definition = { label: 'weight', value_type: 'mass', builtin: true };
const set = {
  set_id: 'set-1',
  position: 0,
  kind: 'normal',
  completed: true,
  reps: null,
  weight_kg: null,
  duration_seconds: null,
  distance_meters: null,
  rpe: null,
  rir: null,
  load_mode: null,
  superset_group: null,
  topology: snapshot,
};
const fixtures = {
  body_definition: {
    metric_id: 'weight',
    ...definition,
    unit: 'kg',
    enabled: true,
  },
  body_measurement: {
    metric_id: 'weight',
    date: '2024-02-29',
    value: 75,
    unit: 'kg',
    measured_at: null,
    timezone: 'Asia/Shanghai',
    definition,
  },
  body_goal: {
    metric_id: 'target_weight',
    value: 70,
    unit: 'kg',
    effective_date: null,
  },
  exercise: {
    exercise_id: 'exercise-1',
    name: 'squat',
    category: 'strength',
    equipment: [],
    primary_muscles: [],
    secondary_muscles: [],
    aliases: [],
    notes: '',
  },
  workout: {
    workout_id: 'workout-1',
    name: 'session',
    date: '2024-02-29',
    timezone: 'UTC',
    started_at: null,
    ended_at: null,
    duration_seconds: null,
    calories_kcal: null,
    body_weight_kg: null,
    target_weight_kg: null,
    exercises: [
      {
        instance_id: 'instance-1',
        exercise_id: 'exercise-1',
        name: 'squat',
        position: 0,
        sets: [set],
        source_snapshot: snapshot,
      },
    ],
    source_snapshot: snapshot,
  },
  schedule_summary: {
    name: 'Weekly focus',
    timezone: 'UTC',
    week_start: 1,
    effective_from: '2024-02-29',
    effective_until: null,
    days: [
      {
        weekday: 1,
        slots: [
          {
            time_slot: 'morning',
            activity: 'strength',
            is_main: true,
          },
        ],
      },
    ],
  },
  personal_media: {
    media_id: 'media-1',
    sha256: 'a'.repeat(64),
    bytes: 100,
    mime: 'image/jpeg',
    kind: 'progress',
    workout_id: null,
    date: '2024-02-29',
    caption: '',
  },
};

function event(resource: keyof typeof fixtures) {
  return {
    version: 1,
    event_id: id,
    connection_id: id,
    producer:
      resource.startsWith('body_') || resource === 'schedule_summary'
        ? 'sparkyfitness'
        : 'opengym',
    resource,
    entity_id: 'entity-1',
    revision: 1,
    source_cursor: 1,
    operation: 'upsert',
    occurred_at: '2026-10-29T06:00:00.000Z',
    payload: fixtures[resource],
  };
}

describe('SparkyGym domain payloads', () => {
  it.each(['\ud800', '\udfff', 'prefix\ud800suffix', '\udc00\ud800'])(
    'rejects unpaired Unicode surrogates in canonical IDs and all JSON strings: %j',
    (invalid) => {
      const value = event('workout');
      expect(
        contracts.sparkyGymEventSchema.safeParse({
          ...value,
          entity_id: invalid,
        }).success
      ).toBe(false);
      expect(
        contracts.sparkyGymExercisePayloadSchema.safeParse({
          ...fixtures.exercise,
          exercise_id: invalid,
        }).success
      ).toBe(false);
      expect(
        contracts.sparkyGymWorkoutPayloadSchema.safeParse({
          ...fixtures.workout,
          workout_id: invalid,
        }).success
      ).toBe(false);
      expect(
        contracts.sparkyGymWorkoutExercisePayloadSchema.safeParse({
          ...fixtures.workout.exercises[0],
          instance_id: invalid,
        }).success
      ).toBe(false);
      expect(
        contracts.sparkyGymWorkoutSetPayloadSchema.safeParse({
          ...set,
          set_id: invalid,
        }).success
      ).toBe(false);
      expect(
        contracts.sparkyGymPersonalMediaPayloadSchema.safeParse({
          ...fixtures.personal_media,
          media_id: invalid,
        }).success
      ).toBe(false);
      for (const payload of [
        { nested: { note: invalid } },
        { nested: { [invalid]: 'value' } },
      ]) {
        expect(
          contracts.sparkyGymEventSchema.safeParse({ ...value, payload })
            .success
        ).toBe(false);
        expect(
          contracts.sparkyGymVersionedJsonSchema.safeParse({
            version: 1,
            ...payload,
          }).success
        ).toBe(false);
      }
      expect(
        contracts.sparkyGymExercisePayloadSchema.safeParse({
          ...fixtures.exercise,
          notes: invalid,
        }).success
      ).toBe(false);
      expect(
        contracts.sparkyGymPersonalMediaPayloadSchema.safeParse({
          ...fixtures.personal_media,
          caption: invalid,
        }).success
      ).toBe(false);
    }
  );
  it('preserves normal Chinese, paired emoji and the literal replacement character without normalization', () => {
    const text = '\u4f53\u91cd-\ud83d\ude80-\ufffd';
    const value = {
      ...event('exercise'),
      entity_id: text,
      payload: {
        ...fixtures.exercise,
        exercise_id: text,
        name: text,
        notes: text,
      },
    };
    expect(contracts.sparkyGymDomainEventSchema.parse(value)).toEqual(value);
    const native = { version: 1, [text]: { note: text } };
    expect(contracts.sparkyGymVersionedJsonSchema.parse(native)).toEqual(
      native
    );
  });
  it('requires a positive safe source cursor for domain events without changing legacy framing', () => {
    const legacy = { ...event('body_measurement'), source_cursor: undefined };
    expect(contracts.sparkyGymEventSchema.safeParse(legacy).success).toBe(true);
    expect(contracts.sparkyGymDomainEventSchema.safeParse(legacy).success).toBe(
      false
    );
    for (const source_cursor of [
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Infinity,
    ]) {
      expect(
        contracts.sparkyGymDomainEventSchema.safeParse({
          ...event('body_measurement'),
          source_cursor,
        }).success
      ).toBe(false);
    }
    expect(
      contracts.sparkyGymDomainEventSchema.safeParse({
        ...event('body_measurement'),
        source_cursor: Number.MAX_SAFE_INTEGER,
      }).success
    ).toBe(true);
  });
  it('exports the separate domain validator', () => {
    expect(contracts).toHaveProperty('sparkyGymDomainEventSchema');
  });
  for (const resource of Object.keys(fixtures) as (keyof typeof fixtures)[]) {
    it(`accepts lossless ${resource} and its source-owned tombstone`, () => {
      expect(
        contracts.sparkyGymDomainEventSchema.parse(event(resource))
      ).toEqual(event(resource));
      expect(
        contracts.sparkyGymDomainEventSchema.safeParse({
          ...event(resource),
          operation: 'delete',
          payload: null,
        }).success
      ).toBe(true);
    });
    it(`rejects wrong direction, embedded owner and unknown ${resource} fields`, () => {
      const value = event(resource);
      for (const patch of [
        {
          producer: value.producer === 'opengym' ? 'sparkyfitness' : 'opengym',
        },
        { user_id: id },
        { payload: { ...value.payload, user_id: id } },
        { payload: { ...value.payload, unexpected: true } },
      ])
        expect(
          contracts.sparkyGymDomainEventSchema.safeParse({ ...value, ...patch })
            .success
        ).toBe(false);
    });
  }
  it.each([
    ['body_measurement', { date: '2025-02-29' }],
    ['body_measurement', { timezone: 'Mars/Olympus' }],
    ['body_measurement', { unit: 'lb' }],
    ['body_measurement', { value: Infinity }],
    ['body_measurement', { value: -1 }],
    ['body_measurement', { value: '75' }],
    ['body_definition', { value_type: 'length', unit: 'kg' }],
    ['body_definition', { metric_id: 'custom:not-uuid' }],
    ['body_goal', { metric_id: 'weekly_weight_change' }],
    ['body_goal', { weekly_goal: 1 }],
    ['body_goal', { value: 0 }],
    ['workout', { calories_kcal: undefined }],
    ['workout', { duration_seconds: -1 }],
    ['workout', { source_snapshot: { version: 0 } }],
    ['workout', { source_snapshot: { version: 1, value: Infinity } }],
    ['exercise', { image_url: 'https://example.com/a.jpg' }],
    ['exercise', { name: 'x'.repeat(301) }],
    ['schedule_summary', { effective_from: '2026-04-31' }],
    ['personal_media', { url: 'https://example.com/a.jpg' }],
    ['personal_media', { bytes: -1 }],
  ] as const)('rejects malformed %s payload %j', (resource, patch) => {
    const value = event(resource);
    expect(
      contracts.sparkyGymDomainEventSchema.safeParse({
        ...value,
        payload: { ...value.payload, ...patch },
      }).success
    ).toBe(false);
  });
  it('retains explicit text quantities without guessing conversions', () => {
    const value = event('body_measurement');
    expect(
      contracts.sparkyGymDomainEventSchema.safeParse({
        ...value,
        payload: {
          ...value.payload,
          metric_id: `custom:${id}`,
          value: 'unavailable',
          unit: 'text',
          definition: { label: 'custom', value_type: 'text', builtin: false },
        },
      }).success
    ).toBe(true);
  });
  it('retains independent same-day custom samples and explicit measurement instants', () => {
    const first = {
      ...event('body_measurement'),
      entity_id: 'custom-sample-1',
      payload: {
        ...fixtures.body_measurement,
        metric_id: `custom:${id}`,
        measured_at: '2024-02-29T00:00:00.000Z',
      },
    };
    const second = {
      ...first,
      entity_id: 'custom-sample-2',
      source_cursor: 2,
      payload: {
        ...first.payload,
        value: 76,
        measured_at: '2024-02-29T01:00:00.000Z',
      },
    };
    const parsed = [first, second].map((value) =>
      contracts.sparkyGymDomainEventSchema.parse(value)
    );
    expect(parsed).toEqual([first, second]);
    expect(new Set(parsed.map((value) => value.entity_id)).size).toBe(2);
  });
  it('requires nullable set quantities and preserves native topology', () => {
    const value = event('workout');
    const payload = fixtures.workout;
    expect(
      contracts.sparkyGymDomainEventSchema.safeParse({
        ...value,
        payload: {
          ...payload,
          exercises: [
            { ...payload.exercises[0], sets: [{ ...set, reps: undefined }] },
          ],
        },
      }).success
    ).toBe(false);
  });
  it.each([
    { version: 1, user_id: id },
    { version: 1, nested: { ownerId: id } },
    { version: 1, native: Array.from({ length: 10001 }, () => 0) },
    { version: 1, native: 'x'.repeat(10001) },
    { version: 1, native: Array.from({ length: 20 }, () => 'x'.repeat(10000)) },
  ])('rejects unsafe or unbounded native JSON %j', (source_snapshot) => {
    expect(
      contracts.sparkyGymDomainEventSchema.safeParse({
        ...event('workout'),
        payload: { ...fixtures.workout, source_snapshot },
      }).success
    ).toBe(false);
  });
  it('preserves provider/external-ID lineage without embedding an application user', () => {
    const source_snapshot = {
      version: 1,
      provider: 'opengym',
      external_id: 'native-session-1',
      supersets: [{ set_ids: ['set-1'], rest_seconds: null }],
    };
    expect(
      contracts.sparkyGymWorkoutPayloadSchema.parse({
        ...fixtures.workout,
        source_snapshot,
      }).source_snapshot
    ).toEqual(source_snapshot);
  });
  it('retains URL text in native personal notes without treating it as fetchable media', () => {
    const source_snapshot = {
      version: 1,
      personal_note: 'https://example.com',
    };
    expect(
      contracts.sparkyGymWorkoutPayloadSchema.parse({
        ...fixtures.workout,
        source_snapshot,
      }).source_snapshot
    ).toEqual(source_snapshot);
  });
  it('accepts signed custom number scores but rejects negative mass', () => {
    const score = {
      ...fixtures.body_measurement,
      metric_id: `custom:${id}`,
      value: -12.5,
      unit: 'none',
      definition: { label: 'score', value_type: 'number', builtin: false },
    };
    expect(
      contracts.sparkyGymBodyMeasurementPayloadSchema.safeParse(score).success
    ).toBe(true);
    expect(
      contracts.sparkyGymBodyMeasurementPayloadSchema.safeParse({
        ...fixtures.body_measurement,
        value: -12.5,
      }).success
    ).toBe(false);
  });
  it('rejects malformed training time buckets and nested unknown fields', () => {
    const day = fixtures.schedule_summary.days[0];
    for (const patch of [
      { time_of_day: '24:00' },
      { time_of_day: '9:30' },
      { time_slot: 'night' },
      { draft: true },
    ]) {
      expect(
        contracts.sparkyGymScheduleSummaryPayloadSchema.safeParse({
          ...fixtures.schedule_summary,
          days: [{ ...day, slots: [{ ...day.slots[0], ...patch }] }],
        }).success
      ).toBe(false);
    }
  });
  it('requires distinct time buckets and exactly one main per training day', () => {
    const day = fixtures.schedule_summary.days[0];
    const first = day.slots[0];
    const second = {
      ...first,
      time_slot: 'evening',
      is_main: false,
    };
    const parse = (slots: typeof day.slots) =>
      contracts.sparkyGymScheduleSummaryPayloadSchema.safeParse({
        ...fixtures.schedule_summary,
        days: [{ ...day, slots }],
      }).success;
    expect(parse([first, second])).toBe(true);
    expect(parse([])).toBe(true);
    expect(parse([first, { ...second, time_slot: first.time_slot }])).toBe(
      false
    );
    expect(parse([{ ...first, is_main: false }, second])).toBe(false);
    expect(parse([first, { ...second, is_main: true }])).toBe(false);
  });
});

const offer = {
  version: 1,
  connection_id: id,
  sf_origin: 'https://sf.example',
  sf_owner_ref: 'sf-owner-ref',
  sf_nonce: 'a'.repeat(43),
  secret: 'b'.repeat(43),
  expires_at: '2026-10-29T06:10:00.000Z',
  peer_origin: 'https://og.example',
  scopes: ['body_definition', 'body_measurement', 'workout'],
  include_history: false,
};
const claim = {
  version: 1,
  connection_id: id,
  sf_owner_ref: 'sf-owner-ref',
  og_owner_ref: 'og-owner-ref',
  sf_origin: 'https://sf.example',
  og_origin: 'https://og.example',
  sf_nonce: 'a'.repeat(43),
  og_nonce: 'b'.repeat(43),
  scopes: offer.scopes,
  include_history: false,
};
const delivery = {
  pending: 0,
  failed: 0,
  pending_media: 0,
  last_success_at: null,
  last_error_code: null,
};
describe('SparkyGym management wire contracts', () => {
  it('rejects malformed opaque owner/media references while preserving Chinese and emoji', () => {
    const unicodeRef = '\u7528\u6237-\ud83d\ude80';
    expect(
      shared.sparkyGymInvitationOfferSchema.parse({
        ...offer,
        sf_owner_ref: unicodeRef,
      }).sf_owner_ref
    ).toBe(unicodeRef);
    expect(
      shared.sparkyGymPairClaimSchema.parse({
        ...claim,
        og_owner_ref: unicodeRef,
      }).og_owner_ref
    ).toBe(unicodeRef);
    for (const invalid of ['\ud800', '\udfff', 'owner-\ud800']) {
      expect(
        shared.sparkyGymInvitationOfferSchema.safeParse({
          ...offer,
          sf_owner_ref: invalid,
        }).success
      ).toBe(false);
      expect(
        shared.sparkyGymPairClaimSchema.safeParse({
          ...claim,
          og_owner_ref: invalid,
        }).success
      ).toBe(false);
      expect(
        shared.sparkyGymMediaFrameMetadataSchema.safeParse({
          connection_id: id,
          request_id: id,
          media_id: invalid,
          sha256: 'a'.repeat(64),
          bytes: 100,
          mime: 'image/jpeg',
        }).success
      ).toBe(false);
    }
  });
  it('validates bounded secret-free delivery observability without inventing a connection error status', () => {
    expect(shared.sparkyGymDeliveryStatusSchema.parse(delivery)).toEqual(
      delivery
    );
    const partialFailure = {
      pending: 2,
      failed: 1,
      pending_media: 3,
      last_success_at: '2026-10-29T06:10:00.000Z',
      last_error_code: 'invalid_payload',
    };
    expect(shared.sparkyGymDeliveryStatusSchema.parse(partialFailure)).toEqual(
      partialFailure
    );
    for (const patch of [
      { pending: -1 },
      { failed: 1.5 },
      { pending_media: Number.MAX_SAFE_INTEGER + 1 },
      { pending: Infinity },
      { last_success_at: undefined },
      { last_error_code: undefined },
      { last_success_at: '2026-02-30T06:10:00.000Z' },
      { last_success_at: '2026-10-29T06:10:00Z' },
      { last_success_at: '2026-10-29T06:10:00.000+00:00' },
      { last_error_code: 'peer rejected the event' },
      { last_error_code: 'x'.repeat(101) },
      { last_error_code: 'invalid_payload\n' },
      { raw_body: '{}' },
      { secret: 'private' },
    ]) {
      expect(
        shared.sparkyGymDeliveryStatusSchema.safeParse({
          ...delivery,
          ...patch,
        }).success
      ).toBe(false);
    }
  });
  it('validates the frozen peer snapshot request/begin/complete wire bodies', () => {
    const request = {
      version: 1,
      action: 'request',
      connection_id: id,
      include_history: false,
    };
    const begin = {
      version: 1,
      action: 'begin',
      connection_id: id,
      snapshot_id: id,
      start_cursor: 10,
      watermark: 20,
      expected_count: 3,
      membership_sha256: 'a'.repeat(64),
      prune_resources: ['schedule_summary'],
    };
    const complete = {
      version: 1,
      action: 'complete',
      connection_id: id,
      snapshot_id: id,
    };
    for (const value of [request, begin, complete])
      expect(shared.sparkyGymPeerSnapshotControlSchema.parse(value)).toEqual(
        value
      );
    expect(shared.sparkyGymPeerSnapshotRequestSchema.parse(request)).toEqual(
      request
    );
    expect(shared.sparkyGymPeerSnapshotBeginSchema.parse(begin)).toEqual(begin);
    expect(shared.sparkyGymPeerSnapshotCompleteSchema.parse(complete)).toEqual(
      complete
    );
    for (const patch of [
      { request_id: id },
      { user_id: id },
      { payload: {} },
      { action: 'item' },
      { expected_count: -1 },
      { start_cursor: -1 },
      { watermark: Number.MAX_SAFE_INTEGER + 1 },
      { membership_sha256: 'A'.repeat(64) },
      { prune_resources: ['workout', 'workout'] },
      { prune_resources: ['nutrition'] },
    ]) {
      expect(
        shared.sparkyGymPeerSnapshotControlSchema.safeParse({
          ...begin,
          ...patch,
        }).success
      ).toBe(false);
    }
    expect(
      shared.sparkyGymPeerSnapshotBeginSchema.safeParse({
        ...begin,
        start_cursor: 0,
        watermark: 0,
        expected_count: 0,
        prune_resources: [],
      }).success
    ).toBe(true);
    expect(
      shared.sparkyGymPeerSnapshotControlSchema.safeParse({
        ...request,
        snapshot_id: id,
      }).success
    ).toBe(false);
  });
  it('validates signed peer snapshot response bodies separately from owner controls', () => {
    for (const status of [
      'snapshot_queued',
      'snapshot_started',
      'snapshot_complete',
    ]) {
      const response = { version: 1, snapshot_id: id, status };
      expect(
        shared.sparkyGymPeerSnapshotResponseSchema.parse(response)
      ).toEqual(response);
    }
    expect(
      shared.sparkyGymPeerSnapshotResponseSchema.parse({
        version: 1,
        status: 'snapshot_queued',
      })
    ).toEqual({ version: 1, status: 'snapshot_queued' });
    for (const patch of [
      { status: 'queued' },
      { secret: 'hidden' },
      { request_id: id },
      { snapshot_id: 'not-uuid' },
    ]) {
      expect(
        shared.sparkyGymPeerSnapshotResponseSchema.safeParse({
          version: 1,
          status: 'snapshot_queued',
          ...patch,
        }).success
      ).toBe(false);
    }
  });
  it('exports strict offer and symmetric claim/acceptance schemas', () => {
    expect(shared).toHaveProperty('sparkyGymInvitationOfferSchema');
    expect(shared.sparkyGymInvitationOfferSchema.parse(offer)).toEqual(offer);
    expect(shared.sparkyGymPairClaimSchema.parse(claim)).toEqual(claim);
    expect(shared.sparkyGymPairAcceptSchema.parse(claim)).toEqual(claim);
  });
  it('rejects unknown owners, weak secrets, unsafe origins and duplicate scopes', () => {
    for (const patch of [
      { user_id: id },
      { secret: 'short' },
      { sf_nonce: 'x'.repeat(44) },
      { peer_origin: 'file:///tmp/peer' },
      { peer_origin: 'https://user:pass@og.example' },
      { peer_origin: 'https://og.example/path' },
      { scopes: ['workout', 'workout'] },
      { expires_at: '2026-02-30T06:10:00.000Z' },
    ])
      expect(
        shared.sparkyGymInvitationOfferSchema.safeParse({ ...offer, ...patch })
          .success
      ).toBe(false);
  });
  it('accepts only explicit owner control bodies without owner IDs', () => {
    const invitation = {
      self_origin: 'http://192.168.200.118:3006',
      peer_origin: offer.peer_origin,
    };
    expect(
      shared.sparkyGymCreateInvitationRequestSchema.parse(invitation)
    ).toEqual(invitation);
    const claimRequest = {
      invitation: offer,
    };
    expect(shared.sparkyGymClaimRequestSchema.parse(claimRequest)).toEqual(
      claimRequest
    );
    expect(
      shared.sparkyGymClaimRequestSchema.safeParse({
        invitation: offer,
        allow_http: true,
      }).success
    ).toBe(false);
    expect(
      shared.sparkyGymCreateInvitationRequestSchema.safeParse({
        ...invitation,
        user_id: id,
      }).success
    ).toBe(false);
    for (const patch of [
      { scopes: ['workout'] },
      { include_history: true },
      { allow_http: false },
      { allow_private_network: false },
      { self_origin: 'http://user:password@192.168.200.118:3006' },
      { self_origin: 'http://192.168.200.118:3006/api' },
    ])
      expect(
        shared.sparkyGymCreateInvitationRequestSchema.safeParse({
          ...invitation,
          ...patch,
        }).success
      ).toBe(false);
    expect(
      shared.sparkyGymCreateInvitationRequestSchema.safeParse({
        ...invitation,
        peer_origin: 'http://192.168.1.2',
      }).success
    ).toBe(true);
    expect(
      shared.sparkyGymPurgeRequestSchema.safeParse({ confirm: false }).success
    ).toBe(false);
    expect(
      shared.sparkyGymPurgeRequestSchema.safeParse({ confirm: true }).success
    ).toBe(true);
  });
  it('keeps public status secret-free and approval/history counts explicit', () => {
    const connection = {
      connection_id: id,
      status: 'pending_approval',
      peer_origin: offer.peer_origin,
      peer_owner_ref: claim.og_owner_ref,
      scopes: offer.scopes,
      include_history: false,
      affected_record_counts: { workout: 4 },
      capabilities: null,
      delivery,
    };
    expect(shared.sparkyGymConnectionStatusSchema.parse(connection)).toEqual(
      connection
    );
    expect(
      shared.sparkyGymStatusResponseSchema.parse({ connections: [connection] })
    ).toEqual({ connections: [connection] });
    expect(shared.sparkyGymControlResponseSchema.parse({ connection })).toEqual(
      { connection }
    );
    expect(
      shared.sparkyGymConnectionStatusSchema.safeParse({
        ...connection,
        delivery: undefined,
      }).success
    ).toBe(false);
    const activeWithFailures = {
      ...connection,
      status: 'active',
      delivery: {
        ...delivery,
        failed: 1,
        pending_media: 2,
        last_error_code: 'media_transfer_failed',
      },
    };
    expect(
      shared.sparkyGymConnectionStatusSchema.parse(activeWithFailures)
    ).toEqual(activeWithFailures);
    for (const key of [
      'secret',
      'encrypted_credentials',
      'queue_body',
      'user_id',
    ]) {
      expect(
        shared.sparkyGymConnectionStatusSchema.safeParse({
          ...connection,
          [key]: 'private',
        }).success
      ).toBe(false);
    }
  });
  it('validates public capabilities and bounded binary metadata', () => {
    const capabilities = {
      version: 1,
      resources: offer.scopes,
      max_event_bytes: 1048576,
      max_media_bytes: 10000,
      media_mime_types: ['image/jpeg'],
    };
    expect(shared.sparkyGymCapabilitiesSchema.parse(capabilities)).toEqual(
      capabilities
    );
    const metadata = {
      connection_id: id,
      request_id: id,
      media_id: 'media-1',
      sha256: 'a'.repeat(64),
      bytes: 100,
      mime: 'image/jpeg',
    };
    expect(shared.sparkyGymMediaFrameMetadataSchema.parse(metadata)).toEqual(
      metadata
    );
    for (const patch of [
      { bytes: Infinity },
      { bytes: 104857601 },
      { url: 'https://example.com' },
      { user_id: id },
    ]) {
      expect(
        shared.sparkyGymMediaFrameMetadataSchema.safeParse({
          ...metadata,
          ...patch,
        }).success
      ).toBe(false);
    }
    expect(shared.sparkyGymOwnerControlRequestSchema.parse({})).toEqual({});
    expect(
      shared.sparkyGymSnapshotRequestSchema.parse({ include_history: true })
    ).toEqual({ include_history: true });
  });
});
