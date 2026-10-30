import { z } from 'zod';

function isWellFormedUnicode(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0xd800 && codePoint <= 0xdfff)
      return false;
  }
  return true;
}

export const sparkyGymStringSchema = z
  .string()
  .refine(isWellFormedUnicode, { message: 'invalid_unicode' });
export const sparkyGymIdentifierSchema = sparkyGymStringSchema
  .min(1)
  .max(200)
  .regex(/^[^\x00-\x1f\x7f]+$/);
export const sparkyGymJsonSchema: z.ZodType<
  z.infer<ReturnType<typeof z.json>>
> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    sparkyGymStringSchema,
    z.array(sparkyGymJsonSchema),
    z.record(sparkyGymStringSchema, sparkyGymJsonSchema),
  ])
);

export const sparkyGymResources = [
  'body_definition',
  'body_measurement',
  'body_goal',
  'exercise',
  'workout',
  'schedule_summary',
  'personal_media',
] as const;

export const sparkyGymResourceProducers = {
  body_definition: 'sparkyfitness',
  body_measurement: 'sparkyfitness',
  body_goal: 'sparkyfitness',
  exercise: 'opengym',
  workout: 'opengym',
  schedule_summary: 'sparkyfitness',
  personal_media: 'opengym',
} as const;

const utcTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString() === value;
  });

const recordUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

export const sparkyGymEventSchema = z
  .object({
    version: z.literal(1),
    event_id: recordUuid,
    connection_id: recordUuid,
    producer: z.enum(['sparkyfitness', 'opengym']),
    resource: z.enum(sparkyGymResources),
    entity_id: sparkyGymIdentifierSchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    source_cursor: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    operation: z.enum(['upsert', 'delete']),
    occurred_at: utcTimestamp,
    payload: z.record(sparkyGymStringSchema, sparkyGymJsonSchema).nullable(),
  })
  .strict()
  .refine(
    (event) => sparkyGymResourceProducers[event.resource] === event.producer
  )
  .refine(
    (event) => (event.operation === 'delete') === (event.payload === null)
  );

export const sparkyGymReceiptSchema = z
  .object({
    version: z.literal(1),
    event_id: recordUuid,
    status: z.enum(['applied', 'duplicate', 'stale']),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export type SparkyGymEvent = z.infer<typeof sparkyGymEventSchema>;
export type SparkyGymReceipt = z.infer<typeof sparkyGymReceiptSchema>;

export const sparkyGymCalendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  });
export const sparkyGymTimezoneSchema = sparkyGymStringSchema
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return !/^[+-]/.test(value);
    } catch {
      return false;
    }
  });
const identifier = sparkyGymIdentifierSchema;
const name = sparkyGymStringSchema.min(1).max(300);
const quantity = z.number().finite().nonnegative();
const position = z.number().int().nonnegative().max(10000);
const metricId = z.union([
  z.string().regex(/^[a-z][a-z0-9_]{0,99}$/),
  z
    .string()
    .regex(
      /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    ),
]);
const valueType = z.enum(['mass', 'length', 'percent', 'number', 'text']);
const unit = z.enum(['kg', 'cm', 'percent', 'none', 'text']);
const definitionShape = {
  label: name,
  value_type: valueType,
  builtin: z.boolean(),
};
const canonicalUnits = {
  mass: 'kg',
  length: 'cm',
  percent: 'percent',
  number: 'none',
  text: 'text',
} as const;

export const sparkyGymBodyDefinitionPayloadSchema = z
  .object({
    metric_id: metricId,
    ...definitionShape,
    unit,
    enabled: z.boolean(),
  })
  .strict()
  .refine((value) => canonicalUnits[value.value_type] === value.unit);
export const sparkyGymBodyMeasurementPayloadSchema = z
  .object({
    metric_id: metricId,
    date: sparkyGymCalendarDaySchema,
    value: z.union([z.number().finite(), sparkyGymStringSchema.max(4000)]),
    unit,
    measured_at: utcTimestamp.nullable(),
    timezone: sparkyGymTimezoneSchema,
    definition: z.object(definitionShape).strict(),
  })
  .strict()
  .refine(
    (value) =>
      canonicalUnits[value.definition.value_type] === value.unit &&
      (value.definition.value_type === 'text') ===
        (typeof value.value === 'string') &&
      (typeof value.value !== 'number' ||
        value.definition.value_type === 'number' ||
        value.value >= 0)
  );
export const sparkyGymBodyGoalPayloadSchema = z
  .object({
    metric_id: z.literal('target_weight'),
    value: quantity.positive(),
    unit: z.literal('kg'),
    effective_date: sparkyGymCalendarDaySchema.nullable(),
  })
  .strict();
const stringList = z.array(name).max(100);
export const sparkyGymExercisePayloadSchema = z
  .object({
    exercise_id: identifier,
    name,
    category: name,
    equipment: stringList,
    primary_muscles: stringList,
    secondary_muscles: stringList,
    aliases: stringList,
    notes: sparkyGymStringSchema.max(10000),
  })
  .strict();

// Native fields are retained, not interpreted. Bounds apply before recursive parsing.
export const sparkyGymVersionedJsonSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    const seen = new Set<object>();
    let nodes = 0;
    let size = 0;
    let valid = true;
    while (pending.length && valid) {
      const item = pending.pop()!;
      const current = item.value;
      if (++nodes > 10000 || item.depth > 16) {
        valid = false;
        break;
      }
      if (current === null || typeof current === 'boolean') continue;
      if (typeof current === 'number') {
        valid = Number.isFinite(current);
        continue;
      }
      if (typeof current === 'string') {
        size += current.length;
        valid = current.length <= 10000 && isWellFormedUnicode(current);
        continue;
      }
      if (typeof current !== 'object' || seen.has(current)) {
        valid = false;
        break;
      }
      seen.add(current);
      if (
        !Array.isArray(current) &&
        Object.getPrototypeOf(current) !== Object.prototype &&
        Object.getPrototypeOf(current) !== null
      ) {
        valid = false;
        break;
      }
      for (const [key, child] of Object.entries(current)) {
        size += key.length;
        if (
          key.length > 200 ||
          !isWellFormedUnicode(key) ||
          /^(?:user_?id|owner_?id)$/i.test(key)
        ) {
          valid = false;
          break;
        }
        pending.push({ value: child, depth: item.depth + 1 });
      }
      if (size > 131072) valid = false;
    }
    if (!valid || size > 131072)
      ctx.addIssue({ code: 'custom', message: 'invalid_native_json' });
  })
  .pipe(z.object({ version: z.literal(1) }).catchall(sparkyGymJsonSchema));

export const sparkyGymWorkoutSetPayloadSchema = z
  .object({
    set_id: identifier,
    position,
    kind: identifier,
    completed: z.boolean(),
    reps: quantity.int().nullable(),
    weight_kg: quantity.nullable(),
    duration_seconds: quantity.nullable(),
    distance_meters: quantity.nullable(),
    rpe: quantity.max(10).nullable(),
    rir: quantity.nullable(),
    load_mode: identifier.nullable(),
    superset_group: identifier.nullable(),
    topology: sparkyGymVersionedJsonSchema,
  })
  .strict();
export const sparkyGymWorkoutExercisePayloadSchema = z
  .object({
    instance_id: identifier,
    exercise_id: identifier,
    name,
    position,
    sets: z.array(sparkyGymWorkoutSetPayloadSchema).max(1000),
    source_snapshot: sparkyGymVersionedJsonSchema,
  })
  .strict();
export const sparkyGymWorkoutPayloadSchema = z
  .object({
    workout_id: identifier,
    name,
    date: sparkyGymCalendarDaySchema,
    timezone: sparkyGymTimezoneSchema,
    started_at: utcTimestamp.nullable(),
    ended_at: utcTimestamp.nullable(),
    duration_seconds: quantity.nullable(),
    calories_kcal: quantity.nullable(),
    body_weight_kg: quantity.nullable(),
    target_weight_kg: quantity.nullable(),
    exercises: z.array(sparkyGymWorkoutExercisePayloadSchema).max(500),
    source_snapshot: sparkyGymVersionedJsonSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.started_at === null ||
      value.ended_at === null ||
      value.started_at <= value.ended_at
  );
const weekday = z.number().int().min(0).max(6);
export const sparkyGymScheduleSummaryPayloadSchema = z
  .object({
    name,
    timezone: sparkyGymTimezoneSchema,
    week_start: weekday,
    effective_from: sparkyGymCalendarDaySchema,
    effective_until: sparkyGymCalendarDaySchema.nullable(),
    days: z
      .array(
        z
          .object({
            weekday,
            slots: z
              .array(
                z
                  .object({
                    time_slot: z.enum([
                      'morning',
                      'noon',
                      'afternoon',
                      'evening',
                    ]),
                    activity: name,
                    is_main: z.boolean(),
                  })
                  .strict()
              )
              .max(4),
          })
          .strict()
      )
      .max(7),
  })
  .strict()
  .refine(
    (value) =>
      (value.effective_until === null ||
        value.effective_from <= value.effective_until) &&
      new Set(value.days.map((day) => day.weekday)).size ===
        value.days.length &&
      value.days.every(
        (day) =>
          new Set(day.slots.map((slot) => slot.time_slot)).size ===
            day.slots.length &&
          (day.slots.length === 0 ||
            day.slots.filter((slot) => slot.is_main).length === 1)
      )
  );
export const sparkyGymPersonalMediaPayloadSchema = z
  .object({
    media_id: identifier,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: quantity.int().positive().max(104857600),
    mime: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]),
    kind: z.enum(['workout', 'progress']),
    workout_id: identifier.nullable(),
    date: sparkyGymCalendarDaySchema,
    caption: sparkyGymStringSchema.max(4000),
  })
  .strict();
export const sparkyGymPayloadSchemas = {
  body_definition: sparkyGymBodyDefinitionPayloadSchema,
  body_measurement: sparkyGymBodyMeasurementPayloadSchema,
  body_goal: sparkyGymBodyGoalPayloadSchema,
  exercise: sparkyGymExercisePayloadSchema,
  workout: sparkyGymWorkoutPayloadSchema,
  schedule_summary: sparkyGymScheduleSummaryPayloadSchema,
  personal_media: sparkyGymPersonalMediaPayloadSchema,
} as const;

// Envelope parsing remains compatible with the exact-byte signing golden vector.
export const sparkyGymDomainEventSchema = sparkyGymEventSchema
  .superRefine((event, ctx) => {
    if (event.source_cursor === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['source_cursor'],
        message: 'source_cursor_required',
      });
    if (event.operation === 'delete') return;
    const result = sparkyGymPayloadSchemas[event.resource].safeParse(
      event.payload
    );
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({ ...issue, path: ['payload', ...issue.path] });
  })
  .transform((event): SparkyGymDomainEvent => event as SparkyGymDomainEvent);
export type SparkyGymBodyDefinitionPayload = z.infer<
  typeof sparkyGymBodyDefinitionPayloadSchema
>;
export type SparkyGymBodyMeasurementPayload = z.infer<
  typeof sparkyGymBodyMeasurementPayloadSchema
>;
export type SparkyGymBodyGoalPayload = z.infer<
  typeof sparkyGymBodyGoalPayloadSchema
>;
export type SparkyGymExercisePayload = z.infer<
  typeof sparkyGymExercisePayloadSchema
>;
export type SparkyGymWorkoutPayload = z.infer<
  typeof sparkyGymWorkoutPayloadSchema
>;
export type SparkyGymWorkoutExercisePayload = z.infer<
  typeof sparkyGymWorkoutExercisePayloadSchema
>;
export type SparkyGymWorkoutSetPayload = z.infer<
  typeof sparkyGymWorkoutSetPayloadSchema
>;
export type SparkyGymScheduleSummaryPayload = z.infer<
  typeof sparkyGymScheduleSummaryPayloadSchema
>;
export type SparkyGymPersonalMediaPayload = z.infer<
  typeof sparkyGymPersonalMediaPayloadSchema
>;
export type SparkyGymResource = (typeof sparkyGymResources)[number];
export type SparkyGymPayloads = {
  [K in SparkyGymResource]: z.infer<(typeof sparkyGymPayloadSchemas)[K]>;
};
export type SparkyGymDomainEvent = {
  [K in SparkyGymResource]: Omit<
    SparkyGymEvent,
    'resource' | 'payload' | 'operation' | 'producer' | 'source_cursor'
  > & {
    resource: K;
    source_cursor: number;
    producer: (typeof sparkyGymResourceProducers)[K];
  } & (
      | { operation: 'upsert'; payload: SparkyGymPayloads[K] }
      | { operation: 'delete'; payload: null }
    );
}[SparkyGymResource];
