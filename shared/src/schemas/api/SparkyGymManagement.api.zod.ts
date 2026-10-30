import { z } from 'zod';
import {
  sparkyGymIdentifierSchema,
  sparkyGymResources,
  sparkyGymStringSchema,
} from './SparkyGym.api.zod.ts';

const uuid = z.uuid();
const reference = sparkyGymIdentifierSchema.regex(/^[^\x00-\x20\x7f]+$/);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const timestamp = z.iso.datetime({ precision: 3 });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const sparkyGymOriginSchema = sparkyGymStringSchema
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        (value === url.origin || value === `${url.origin}/`)
      );
    } catch {
      return false;
    }
  });
export const sparkyGymScopesSchema = z
  .array(z.enum(sparkyGymResources))
  .min(1)
  .max(7)
  .refine((values) => new Set(values).size === values.length);
const sharedPairFields = {
  version: z.literal(1),
  connection_id: uuid,
  sf_owner_ref: reference,
  sf_origin: sparkyGymOriginSchema,
  sf_nonce: token,
  scopes: sparkyGymScopesSchema,
  include_history: z.boolean(),
};
export const sparkyGymInvitationOfferSchema = z
  .object({
    ...sharedPairFields,
    secret: token,
    expires_at: timestamp,
    peer_origin: sparkyGymOriginSchema,
  })
  .strict();
export const sparkyGymPairClaimSchema = z
  .object({
    ...sharedPairFields,
    og_owner_ref: reference,
    og_origin: sparkyGymOriginSchema,
    og_nonce: token,
  })
  .strict();
export const sparkyGymPairAcceptSchema = sparkyGymPairClaimSchema;
export const sparkyGymCreateInvitationRequestSchema = z
  .object({
    peer_origin: sparkyGymOriginSchema,
    scopes: sparkyGymScopesSchema,
    include_history: z.boolean(),
    allow_http: z.boolean(),
    allow_private_network: z.boolean(),
  })
  .strict()
  .refine(
    (value) => value.allow_http || value.peer_origin.startsWith('https://')
  );
export const sparkyGymClaimRequestSchema = z
  .object({
    invitation: sparkyGymInvitationOfferSchema,
    allow_http: z.boolean(),
    allow_private_network: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      value.allow_http || value.invitation.sf_origin.startsWith('https://')
  );
export const sparkyGymRotateRequestSchema =
  sparkyGymCreateInvitationRequestSchema;
export const sparkyGymOwnerControlRequestSchema = z.object({}).strict();
export const sparkyGymPeerRevokeSchema = z
  .object({
    version: z.literal(1),
    connection_id: uuid,
  })
  .strict();
export const sparkyGymPurgeRequestSchema = z
  .object({ confirm: z.literal(true) })
  .strict();
export const sparkyGymSnapshotRequestSchema = z
  .object({ include_history: z.boolean() })
  .strict();
export const sparkyGymPeerSnapshotRequestSchema = z
  .object({
    version: z.literal(1),
    action: z.literal('request'),
    connection_id: uuid,
    include_history: z.boolean(),
  })
  .strict();
export const sparkyGymPeerSnapshotBeginSchema = z
  .object({
    version: z.literal(1),
    action: z.literal('begin'),
    connection_id: uuid,
    snapshot_id: uuid,
    start_cursor: count,
    watermark: count,
    expected_count: count,
    membership_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    prune_resources: z
      .array(z.enum(sparkyGymResources))
      .max(7)
      .refine((resources) => new Set(resources).size === resources.length),
  })
  .strict();
export const sparkyGymPeerSnapshotCompleteSchema = z
  .object({
    version: z.literal(1),
    action: z.literal('complete'),
    connection_id: uuid,
    snapshot_id: uuid,
  })
  .strict();
export const sparkyGymPeerSnapshotControlSchema = z.discriminatedUnion(
  'action',
  [
    sparkyGymPeerSnapshotRequestSchema,
    sparkyGymPeerSnapshotBeginSchema,
    sparkyGymPeerSnapshotCompleteSchema,
  ]
);
export const sparkyGymPeerSnapshotResponseSchema = z
  .object({
    version: z.literal(1),
    snapshot_id: uuid.optional(),
    status: z.enum([
      'snapshot_queued',
      'snapshot_started',
      'snapshot_complete',
    ]),
  })
  .strict();
export const sparkyGymCapabilitiesSchema = z
  .object({
    version: z.literal(1),
    resources: sparkyGymScopesSchema,
    max_event_bytes: count.positive().max(1048576),
    max_media_bytes: count.positive().max(104857600),
    media_mime_types: z
      .array(
        z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/)
      )
      .max(32),
  })
  .strict();
export const sparkyGymDeliveryStatusSchema = z
  .object({
    pending: count,
    failed: count,
    pending_media: count,
    last_success_at: timestamp.nullable(),
    last_error_code: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/)
      .nullable(),
  })
  .strict();
export const sparkyGymConnectionStatusSchema = z
  .object({
    connection_id: uuid,
    status: z.enum([
      'invited',
      'pending_approval',
      'active',
      'paused',
      'revoked',
      'expired',
    ]),
    peer_origin: sparkyGymOriginSchema,
    peer_owner_ref: reference.nullable(),
    scopes: sparkyGymScopesSchema,
    include_history: z.boolean(),
    affected_record_counts: z.partialRecord(z.enum(sparkyGymResources), count),
    capabilities: sparkyGymCapabilitiesSchema.nullable(),
    delivery: sparkyGymDeliveryStatusSchema,
  })
  .strict();
export const sparkyGymStatusResponseSchema = z
  .object({ connections: z.array(sparkyGymConnectionStatusSchema).max(100) })
  .strict();
export const sparkyGymControlResponseSchema = z
  .object({ connection: sparkyGymConnectionStatusSchema })
  .strict();
export const sparkyGymInvitationResponseSchema = z
  .object({
    invitation: sparkyGymInvitationOfferSchema,
    connection: sparkyGymConnectionStatusSchema,
  })
  .strict();
export const sparkyGymClaimResponseSchema = sparkyGymControlResponseSchema;
export const sparkyGymMediaFrameMetadataSchema = z
  .object({
    connection_id: uuid,
    request_id: uuid,
    media_id: reference,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: count.positive().max(104857600),
    mime: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
  })
  .strict();

export const sparkyGymPeerMediaReceiptSchema = sparkyGymMediaFrameMetadataSchema
  .pick({ media_id: true, sha256: true })
  .extend({ version: z.literal(1), status: z.literal('ready') })
  .strict();

export type SparkyGymInvitationOffer = z.infer<
  typeof sparkyGymInvitationOfferSchema
>;
export type SparkyGymPairClaim = z.infer<typeof sparkyGymPairClaimSchema>;
export type SparkyGymPairAccept = z.infer<typeof sparkyGymPairAcceptSchema>;
export type SparkyGymCreateInvitationRequest = z.infer<
  typeof sparkyGymCreateInvitationRequestSchema
>;
export type SparkyGymClaimRequest = z.infer<typeof sparkyGymClaimRequestSchema>;
export type SparkyGymRotateRequest = z.infer<
  typeof sparkyGymRotateRequestSchema
>;
export type SparkyGymOwnerControlRequest = z.infer<
  typeof sparkyGymOwnerControlRequestSchema
>;
export type SparkyGymPurgeRequest = z.infer<typeof sparkyGymPurgeRequestSchema>;
export type SparkyGymSnapshotRequest = z.infer<
  typeof sparkyGymSnapshotRequestSchema
>;
export type SparkyGymPeerSnapshotRequest = z.infer<
  typeof sparkyGymPeerSnapshotRequestSchema
>;
export type SparkyGymPeerSnapshotBegin = z.infer<
  typeof sparkyGymPeerSnapshotBeginSchema
>;
export type SparkyGymPeerSnapshotComplete = z.infer<
  typeof sparkyGymPeerSnapshotCompleteSchema
>;
export type SparkyGymPeerSnapshotControl = z.infer<
  typeof sparkyGymPeerSnapshotControlSchema
>;
export type SparkyGymPeerSnapshotResponse = z.infer<
  typeof sparkyGymPeerSnapshotResponseSchema
>;
export type SparkyGymCapabilities = z.infer<typeof sparkyGymCapabilitiesSchema>;
export type SparkyGymDeliveryStatus = z.infer<
  typeof sparkyGymDeliveryStatusSchema
>;
export type SparkyGymConnectionStatus = z.infer<
  typeof sparkyGymConnectionStatusSchema
>;
export type SparkyGymStatusResponse = z.infer<
  typeof sparkyGymStatusResponseSchema
>;
export type SparkyGymControlResponse = z.infer<
  typeof sparkyGymControlResponseSchema
>;
export type SparkyGymInvitationResponse = z.infer<
  typeof sparkyGymInvitationResponseSchema
>;
export type SparkyGymClaimResponse = z.infer<
  typeof sparkyGymClaimResponseSchema
>;
export type SparkyGymMediaFrameMetadata = z.infer<
  typeof sparkyGymMediaFrameMetadataSchema
>;
