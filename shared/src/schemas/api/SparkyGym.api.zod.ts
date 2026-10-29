import { z } from 'zod';

export const sparkyGymResources = [
  'body_measurement',
  'body_goal',
  'exercise',
  'workout',
  'schedule_summary',
  'personal_media',
] as const;

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
    entity_id: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[^\x00-\x1f\x7f]+$/),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    operation: z.enum(['upsert', 'delete']),
    occurred_at: utcTimestamp,
    payload: z.record(z.string(), z.json()).nullable(),
  })
  .strict()
  .refine((event) => {
    const bodyResource =
      event.resource === 'body_measurement' || event.resource === 'body_goal';
    return (event.producer === 'sparkyfitness') === bodyResource;
  })
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
