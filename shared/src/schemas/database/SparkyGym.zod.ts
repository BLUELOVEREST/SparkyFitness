import { z } from 'zod';
import { sparkyGymResources } from '../api/SparkyGym.api.zod.ts';
export const sparkyGymConnectionStateSchema = z.enum([
  'pending',
  'claimed',
  'activating',
  'active',
  'paused',
  'revoked',
]);

const jsonObject = z.record(z.string(), z.json());
const timestamps = { created_at: z.coerce.date(), updated_at: z.coerce.date() };
export const sparkyGymConnectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  self_origin: z.string(),
  peer_origin: z.string(),
  peer_user_id: z.string().nullable(),
  status: sparkyGymConnectionStateSchema,
  scopes: z.array(z.enum(sparkyGymResources)),
  allow_private: z.boolean(),
  allow_http: z.boolean(),
  credentials_encrypted: z.string(),
  invitation_public: jsonObject,
  claim: jsonObject.nullable(),
  expires_at: z.coerce.date().nullable(),
  activated_at: z.coerce.date().nullable(),
  replaces_connection_id: z.string().uuid().nullable(),
  last_error: z.string().nullable(),
  ...timestamps,
});
export const sparkyGymStreamSchema = z.object({
  user_id: z.string().uuid(),
  connection_id: z.string().uuid(),
  peer_ref: z.string(),
  direction: z.enum(['in', 'out']),
  resource: z.enum(sparkyGymResources),
  entity_id: z.string(),
  revision: z.coerce.number().int().nonnegative(),
  updated_at: z.coerce.date(),
});
export const sparkyGymOutboxSchema = z.object({
  source_cursor: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  connection_id: z.string().uuid(),
  kind: z.enum(['event', 'control', 'media']),
  path: z.string(),
  method: z.enum(['GET', 'POST']),
  body: z.string(),
  body_bytes: z.instanceof(Uint8Array).nullable(),
  body_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  request_id: z.string().uuid(),
  resource: z.enum(sparkyGymResources).nullable(),
  entity_id: z.string().nullable(),
  revision: z.coerce.number().nullable(),
  attempts: z.number().int(),
  next_due_at: z.coerce.date(),
  lease_token: z.string().uuid().nullable(),
  leased_until: z.coerce.date().nullable(),
  status: z.enum(['pending', 'delivered', 'terminal']),
  receipt: jsonObject.nullable(),
  created_xid: z.coerce.string(),
  last_error: z.string().nullable(),
  ...timestamps,
});
export const sparkyGymInboxSchema = z.object({
  user_id: z.string().uuid(),
  connection_id: z.string().uuid(),
  request_id: z.string().uuid(),
  body_sha256: z.string(),
  receipt: jsonObject,
  created_at: z.coerce.date(),
});
export const sparkyGymEntitySchema = z.object({
  user_id: z.string().uuid(),
  peer_ref: z.string(),
  resource: z.enum(sparkyGymResources),
  entity_id: z.string(),
  local_id: z.string().nullable(),
  raw_payload: jsonObject.nullable(),
  tombstone: z.boolean(),
  ...timestamps,
  last_source_cursor: z.coerce
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER),
});
export const sparkyGymSourceHeadSchema = z.object({
  user_id: z.string().uuid(),
  peer_ref: z.string(),
  last_source_cursor: z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER),
  ...timestamps,
});
export const sparkyGymNotificationSchema = z.object({
  id: z.coerce.string(),
  user_id: z.string().uuid(),
  resource: z.string(),
  payload: jsonObject,
  created_at: z.coerce.date(),
});
export const sparkyGymMediaSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  sha256: z.string(),
  bytes: z.coerce.number(),
  mime: z.string(),
  private_path: z.string().nullable(),
  metadata: jsonObject,
  status: z.enum(['pending', 'ready', 'failed', 'detached']),
  last_error: z.string().nullable(),
  ...timestamps,
});
export const sparkyGymSnapshotSchema = z
  .object({
    user_id: z.string().uuid(),
    connection_id: z.string().uuid(),
    snapshot_id: z.string().uuid(),
    peer_ref: z.string(),
    start_cursor: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    watermark: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expected_count: z.number().int().nonnegative(),
    membership_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    prune_resources: z.array(z.enum(sparkyGymResources)),
    status: z.enum(['open', 'complete', 'failed']),
    ...timestamps,
  })
  .refine((value) => value.watermark >= value.start_cursor);
export const sparkyGymSnapshotMemberSchema = z.object({
  user_id: z.string().uuid(),
  connection_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
  resource: z.enum(sparkyGymResources),
  entity_id: z.string(),
});
export type SparkyGymConnection = z.infer<typeof sparkyGymConnectionSchema>;
export type SparkyGymStream = z.infer<typeof sparkyGymStreamSchema>;
export type SparkyGymOutbox = z.infer<typeof sparkyGymOutboxSchema>;
export type SparkyGymInbox = z.infer<typeof sparkyGymInboxSchema>;
export type SparkyGymEntity = z.infer<typeof sparkyGymEntitySchema>;
export type SparkyGymSourceHead = z.infer<typeof sparkyGymSourceHeadSchema>;
export type SparkyGymNotification = z.infer<typeof sparkyGymNotificationSchema>;
export type SparkyGymMedia = z.infer<typeof sparkyGymMediaSchema>;
export type SparkyGymSnapshot = z.infer<typeof sparkyGymSnapshotSchema>;
export type SparkyGymSnapshotMember = z.infer<
  typeof sparkyGymSnapshotMemberSchema
>;
