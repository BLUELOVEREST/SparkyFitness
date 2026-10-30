import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  sparkyGymResources,
  sparkyGymConnectionStatusSchema,
  sparkyGymCreateInvitationRequestSchema,
  sparkyGymInvitationOfferSchema,
  sparkyGymPairClaimSchema,
  sparkyGymDomainEventSchema,
  sparkyGymPeerSnapshotControlSchema,
  sparkyGymPeerSnapshotResponseSchema,
  sparkyGymControlResponseSchema,
  sparkyGymReceiptSchema,
  sparkyGymCapabilitiesSchema,
  sparkyGymPeerRevokeSchema,
  type SparkyGymConnection,
  type SparkyGymConnectionStatus,
  type SparkyGymOutbox,
  type SparkyGymCapabilities,
  type SparkyGymResource,
} from '@workspace/shared';
import * as repository from '../../models/sparkyGymRepository.js';
import {
  openSecrets,
  sealSecrets,
  derivePairKeys,
  signControlRequest,
  verifyControlRequest,
  signResponse,
  verifyResponse,
  verifyMediaPreflight,
} from './security.js';
import { sameBodyDigest, signRequest, verifyRequest } from './protocol.js';
import {
  requestPeer,
  resolvePeerAddress,
  validatePeerOrigin,
} from './transport.js';
import { retryDeadline } from './delivery.js';
import { enqueueBodySnapshot, handleSnapshot } from './snapshots.js';
import {
  applySparkyGymProjection,
  purgeSparkyGymProjections,
  markSparkyGymMediaReady,
} from './projections.js';
import {
  decodeMediaFrame,
  persistArchive,
  privateArchiveRoot,
  removeArchive,
} from './media.js';

export class IntegrationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(code);
  }
}
export interface PeerHeaders {
  keyId: string;
  timestamp: string;
  signature: string;
  requestId: string;
}
export interface PeerContext {
  connection: SparkyGymConnection;
  headers: PeerHeaders;
  now: number;
  path: string;
  method: string;
}
export interface PeerReply {
  status: number;
  body: Buffer;
  headers: Record<string, string>;
}
const prefix = '/api/integrations/v1';
const token = () => randomBytes(32).toString('base64url');
const digest = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
const peerRef = (c: SparkyGymConnection) =>
  `${c.peer_origin}\n${c.peer_user_id}`;
const revokeSchema = sparkyGymPeerRevokeSchema;
const json = (raw: Buffer): unknown =>
  JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
const policy = (c: SparkyGymConnection) => ({
  allow_http: c.allow_http,
  allow_private_network: c.allow_private,
});
const capabilities: SparkyGymCapabilities = {
  version: 1,
  resources: [...sparkyGymResources],
  max_event_bytes: 1048576,
  max_media_bytes: 104857600,
  media_mime_types: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ],
};

export function parsePeerHeaders(
  input: Record<keyof PeerHeaders, unknown>,
  path: string,
  now: number
): PeerHeaders {
  const parsed = z
    .object({
      keyId: z
        .string()
        .regex(
          path === `${prefix}/pair/claim`
            ? /^[0-9a-f-]{36}$/i
            : /^[0-9a-f-]{36}_og$/i
        ),
      requestId: z.uuid(),
      timestamp: z.string().regex(/^(0|[1-9]\d{0,15})$/),
      signature: z.string().regex(/^v1=[a-f0-9]{64}$/),
    })
    .parse(input);
  z.uuid().parse(parsed.keyId.replace(/_og$/, ''));
  if (
    !Number.isSafeInteger(Number(parsed.timestamp)) ||
    Math.abs(now - Number(parsed.timestamp)) > 300
  )
    throw new IntegrationError(401, 'invalid_signature');
  return parsed;
}
export function classifyDeliveryFailure(
  status: number,
  authenticated: boolean
): 'retry' | 'terminal' | 'pause' {
  if (status === 401 || status === 403 || (authenticated && status === 409))
    return 'pause';
  if (authenticated && [400, 404, 405, 413, 415, 422].includes(status))
    return 'terminal';
  return 'retry';
}
export function publicConnectionState(
  status: SparkyGymConnection['status'],
  expiry: Date | null
): SparkyGymConnectionStatus['status'] {
  if (status === 'pending')
    return expiry && expiry.getTime() <= Date.now() ? 'expired' : 'invited';
  if (status === 'claimed' || status === 'activating')
    return 'pending_approval';
  return status;
}
function safeError(value: string | null): string | null {
  return value && /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(value)
    ? value
    : value
      ? 'delivery_failed'
      : null;
}

export class SparkyGymService {
  private wakeHandler: () => void = () => {};
  setWakeHandler(handler: () => void): void {
    this.wakeHandler = handler;
  }
  wake(): void {
    this.wakeHandler();
  }

  async publicStatus(
    client: PoolClient,
    c: SparkyGymConnection,
    forPeer = false
  ): Promise<SparkyGymConnectionStatus> {
    const counts = await client.query<{
      resource: SparkyGymResource;
      count: string;
    }>(
      'SELECT resource,count(*)::text AS count FROM sparkygym_entities WHERE user_id=$1 AND peer_ref=$2 AND NOT tombstone GROUP BY resource',
      [c.user_id, peerRef(c)]
    );
    const affected: Partial<Record<SparkyGymResource, number>> =
      Object.fromEntries(
        counts.rows.map((row) => [row.resource, Number(row.count)])
      );
    const bodyCounts = await client.query<{
      resource: SparkyGymResource;
      count: string;
    }>(
      `SELECT resource,count(*)::text AS count FROM (
        SELECT * FROM public.sparkygym_body_snapshot()
        UNION ALL SELECT * FROM public.sparkygym_schedule_snapshot()
      ) source_items GROUP BY resource`
    );
    for (const row of bodyCounts.rows)
      if (c.scopes.includes(row.resource))
        affected[row.resource] = Number(row.count);
    const queue = await client.query<{
      pending: string;
      failed: string;
      last_success_at: Date | null;
      last_error: string | null;
    }>(
      `SELECT count(*) FILTER (WHERE status='pending')::text AS pending,
       count(*) FILTER (WHERE status='terminal')::text AS failed,
       max(updated_at) FILTER (WHERE status='delivered') AS last_success_at,
       (array_agg(last_error ORDER BY updated_at DESC) FILTER (WHERE last_error IS NOT NULL))[1] AS last_error
       FROM sparkygym_outbox WHERE user_id=$1 AND connection_id=$2`,
      [c.user_id, c.id]
    );
    const media = await client.query<{ count: string }>(
      `SELECT count(DISTINCT m.id)::text AS count FROM sparkygym_media m JOIN sparkygym_entities e
       ON e.user_id=m.user_id AND e.local_id=m.id::text AND e.resource='personal_media'
       WHERE m.user_id=$1 AND e.peer_ref=$2 AND NOT e.tombstone AND m.status IN ('pending','failed')`,
      [c.user_id, peerRef(c)]
    );
    const delivery = queue.rows[0];
    return sparkyGymConnectionStatusSchema.parse({
      connection_id: c.id,
      status: publicConnectionState(c.status, c.expires_at),
      peer_origin: c.peer_origin,
      peer_owner_ref: c.peer_user_id,
      scopes: c.scopes,
      include_history: c.invitation_public.include_history === true,
      affected_record_counts: forPeer ? {} : affected,
      capabilities:
        sparkyGymCapabilitiesSchema.safeParse(
          c.invitation_public.peer_capabilities
        ).data ?? null,
      delivery: {
        pending: Number(delivery?.pending ?? 0),
        failed: Number(delivery?.failed ?? 0),
        pending_media: Number(media.rows[0]?.count ?? 0),
        last_success_at: delivery?.last_success_at?.toISOString() ?? null,
        last_error_code: safeError(
          c.last_error ?? delivery?.last_error ?? null
        ),
      },
    });
  }

  async list(owner: string) {
    return repository.withOwnerTransaction(owner, async (client) => {
      const connections = await repository.listConnections(owner, client);
      return {
        connections: await Promise.all(
          connections.slice(-100).map((c) => this.publicStatus(client, c))
        ),
      };
    });
  }

  async invite(owner: string, value: unknown, replaces?: string) {
    const input = sparkyGymCreateInvitationRequestSchema.parse(value);
    const destination = validatePeerOrigin(input.peer_origin, input);
    await resolvePeerAddress(destination, input);
    const self = new URL(process.env.SPARKY_FITNESS_FRONTEND_URL || '').origin;
    const invitation = sparkyGymInvitationOfferSchema.parse({
      version: 1,
      connection_id: randomUUID(),
      sf_owner_ref: owner,
      sf_origin: self,
      sf_nonce: token(),
      secret: token(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
      peer_origin: destination.origin,
      scopes: input.scopes,
      include_history: input.include_history,
    });
    return repository.withOwnerTransaction(owner, async (client) => {
      if (replaces) {
        const old = await this.owned(client, owner, replaces);
        if (!old.peer_user_id || old.peer_origin !== destination.origin)
          throw new IntegrationError(409, 'rotation_peer_mismatch');
        if (!input.include_history)
          throw new IntegrationError(409, 'rotation_requires_history_approval');
      }
      const all = await repository.listConnections(owner, client);
      if (
        all.filter(
          (c) =>
            !['revoked'].includes(c.status) &&
            publicConnectionState(c.status, c.expires_at) !== 'expired'
        ).length >= 10
      )
        throw new IntegrationError(409, 'connection_limit');
      const { secret, ...publicOffer } = invitation;
      const c = await repository.createConnection(
        owner,
        {
          id: invitation.connection_id,
          self_origin: self,
          peer_origin: destination.origin,
          scopes: invitation.scopes,
          status: 'pending',
          allow_http: input.allow_http,
          allow_private: input.allow_private_network,
          expires_at: new Date(invitation.expires_at),
          credentials_encrypted: sealSecrets(invitation.connection_id, {
            version: 1,
            sf_nonce: invitation.sf_nonce,
            invitation_secret: secret,
          }),
          invitation_public: publicOffer,
          replaces_connection_id: replaces ?? null,
        },
        client
      );
      await repository.appendNotification(
        owner,
        'connection',
        { connection_id: c.id, status: 'pending' },
        client
      );
      return { invitation, connection: await this.publicStatus(client, c) };
    });
  }

  private async owned(
    client: PoolClient,
    owner: string,
    id: string
  ): Promise<SparkyGymConnection> {
    z.uuid().parse(id);
    const c = await repository.getConnection(owner, id, client);
    if (!c) throw new IntegrationError(404, 'connection_not_found');
    return c;
  }

  async action(
    owner: string,
    id: string,
    action: 'approve' | 'pause' | 'resume' | 'revoke' | 'snapshot' | 'purge',
    input: { include_history?: boolean } = {}
  ) {
    const result = await repository.withOwnerTransaction(
      owner,
      async (client) => {
        let c = await this.owned(client, owner, id);
        if (action === 'approve') {
          if (c.status !== 'claimed' || !c.claim)
            throw new IntegrationError(409, 'claim_required');
          if (c.replaces_connection_id) {
            const previous = await this.owned(
              client,
              owner,
              c.replaces_connection_id
            );
            if (
              previous.peer_origin !== c.peer_origin ||
              previous.peer_user_id !== c.peer_user_id
            )
              throw new IntegrationError(409, 'rotation_peer_mismatch');
          }
          await repository.enqueueControl(
            owner,
            {
              connection_id: id,
              request_id: id,
              path: `${prefix}/pair/accept`,
              body: JSON.stringify(c.claim),
            },
            client
          );
          c = (await repository.updateConnection(
            owner,
            id,
            { status: 'activating', last_error: null },
            client
          ))!;
        } else if (action === 'pause') {
          if (!['active', 'activating'].includes(c.status))
            throw new IntegrationError(409, 'connection_not_active');
          c = (await repository.updateConnection(
            owner,
            id,
            { status: 'paused' },
            client
          ))!;
        } else if (action === 'resume') {
          if (c.status !== 'paused')
            throw new IntegrationError(409, 'connection_not_paused');
          const snapshotPending = c.last_error === 'initial_snapshot_pending';
          c = (await repository.updateConnection(
            owner,
            id,
            {
              status: c.activated_at ? 'active' : 'activating',
              last_error: null,
            },
            client
          ))!;
          if (snapshotPending && c.status === 'active')
            await this.queueSnapshots(
              client,
              c,
              c.invitation_public.include_history === true
            );
          await client.query(
            `UPDATE sparkygym_outbox SET next_due_at=now() WHERE user_id=$1 AND connection_id=$2 AND status='pending' AND lease_token IS NULL
`,
            [owner, id]
          );
        } else if (action === 'revoke') {
          if (c.status !== 'revoked') {
            if (c.peer_user_id)
              await repository.enqueueControl(
                owner,
                {
                  connection_id: id,
                  path: `${prefix}/revoke`,
                  body: JSON.stringify({ version: 1, connection_id: id }),
                },
                client
              );
            const secret = openSecrets(c.id, c.credentials_encrypted);
            c = (await repository.updateConnection(
              owner,
              id,
              {
                status: 'revoked',
                credentials_encrypted: c.peer_user_id
                  ? c.credentials_encrypted
                  : sealSecrets(c.id, {
                      version: 1,
                      sf_nonce: secret.sf_nonce,
                    }),
              },
              client
            ))!;
          }
        } else if (action === 'snapshot') {
          if (c.status !== 'active')
            throw new IntegrationError(409, 'connection_not_active');
          if (
            input.include_history &&
            c.invitation_public.include_history !== true
          )
            throw new IntegrationError(409, 'history_not_authorized');
          await this.queueSnapshots(client, c, input.include_history === true);
        } else {
          if (c.status !== 'revoked' || !c.peer_user_id)
            throw new IntegrationError(409, 'revoke_before_purge');
          const siblings = await client.query(
            `SELECT id FROM sparkygym_connections WHERE user_id=$1 AND peer_origin=$2 AND peer_user_id=$3 AND status<>'revoked'
`,
            [owner, c.peer_origin, c.peer_user_id]
          );
          if (siblings.rowCount)
            throw new IntegrationError(409, 'source_still_connected');
          await purgeSparkyGymProjections(client, owner, peerRef(c));
          await client.query(
            'UPDATE sparkygym_entities SET tombstone=true,raw_payload=NULL,updated_at=now() WHERE user_id=$1 AND peer_ref=$2',
            [owner, peerRef(c)]
          );
          await client.query(
            `UPDATE sparkygym_media m SET status='detached',metadata='{}'::jsonb,updated_at=now()
             WHERE m.user_id=$1 AND EXISTS
               (SELECT 1 FROM sparkygym_entities e WHERE e.user_id=$1 AND e.peer_ref=$2 AND e.resource='personal_media' AND e.local_id=m.id::text)
             AND NOT EXISTS
               (SELECT 1 FROM sparkygym_entities e WHERE e.user_id=$1 AND e.resource='personal_media' AND e.local_id=m.id::text AND NOT e.tombstone)`,
            [owner, peerRef(c)]
          );
        }
        await repository.appendNotification(
          owner,
          'connection',
          { connection_id: id, status: c.status },
          client
        );
        return { connection: await this.publicStatus(client, c) };
      }
    );
    if (action === 'purge') await this.collectDetachedMedia(owner, id);
    this.wake();
    return result;
  }

  private async collectDetachedMedia(
    owner: string,
    connectionId: string
  ): Promise<void> {
    // The logical purge has already committed. A retry can safely finish unlinking
    // detached files, even if deletion or this second transaction is interrupted.
    await repository.withOwnerTransaction(owner, async (client) => {
      const connection = await this.owned(client, owner, connectionId);
      const rows = await client.query<{
        id: string;
        sha256: string;
        private_path: string | null;
      }>(
        `SELECT m.id,m.sha256,m.private_path FROM sparkygym_media m
         WHERE m.user_id=$1 AND m.status='detached' AND EXISTS
           (SELECT 1 FROM sparkygym_entities e WHERE e.user_id=$1 AND e.peer_ref=$2 AND e.resource='personal_media' AND e.local_id=m.id::text)
         AND NOT EXISTS
           (SELECT 1 FROM sparkygym_entities e WHERE e.user_id=$1 AND e.resource='personal_media' AND e.local_id=m.id::text AND (NOT e.tombstone OR e.raw_payload IS NOT NULL))
         FOR UPDATE OF m`,
        [owner, peerRef(connection)]
      );
      for (const row of rows.rows) {
        removeArchive(
          privateArchiveRoot(),
          owner,
          row.sha256,
          row.private_path
        );
        await client.query(
          'DELETE FROM sparkygym_media WHERE user_id=$1 AND id=$2',
          [owner, row.id]
        );
      }
    });
  }

  private async queueSnapshots(
    client: PoolClient,
    c: SparkyGymConnection,
    history: boolean
  ): Promise<void> {
    await enqueueBodySnapshot(client, c, history);
    if (
      c.scopes.some((scope) =>
        ['exercise', 'workout', 'personal_media'].includes(scope)
      )
    )
      await repository.enqueueControl(
        c.user_id,
        {
          connection_id: c.id,
          path: `${prefix}/snapshot`,
          body: JSON.stringify({
            version: 1,
            action: 'request',
            connection_id: c.id,
            include_history: history,
          }),
        },
        client
      );
  }

  async preauthenticate(
    path: string,
    method: string,
    values: Record<keyof PeerHeaders, unknown>
  ): Promise<PeerContext> {
    const now = Math.floor(Date.now() / 1000);
    const headers = parsePeerHeaders(values, path, now);
    const c = await repository.lookupPeerConnectionByKeyId(headers.keyId);
    if (!c || (c.status === 'revoked' && path !== `${prefix}/revoke`))
      throw new IntegrationError(401, 'invalid_signature');
    if (c.status === 'revoked') {
      const secrets = openSecrets(c.id, c.credentials_encrypted);
      const receipt = secrets.revocation_receipt;
      if (receipt) {
        const expected = createHmac(
          'sha256',
          Buffer.from(receipt.incoming_key, 'base64url')
        )
          .update(
            [
              'sparkygym-control-v1',
              'POST',
              `${prefix}/revoke`,
              receipt.request_id,
              headers.timestamp,
              headers.keyId,
              receipt.body_sha256,
            ].join('\n')
          )
          .digest();
        if (
          method !== 'POST' ||
          headers.requestId !== receipt.request_id ||
          !timingSafeEqual(
            expected,
            Buffer.from(headers.signature.slice(3), 'hex')
          )
        )
          throw new IntegrationError(401, 'invalid_signature');
      } else if (!secrets.incoming_key) {
        throw new IntegrationError(401, 'invalid_signature');
      }
    }
    if (path === `${prefix}/pair/claim`) {
      if (
        method !== 'POST' ||
        headers.requestId !== c.id ||
        (c.status === 'pending' &&
          (!c.expires_at || c.expires_at.getTime() <= Date.now()))
      )
        throw new IntegrationError(401, 'invitation_expired');
    } else if (
      path === `${prefix}/media` &&
      !c.scopes.includes('personal_media')
    )
      throw new IntegrationError(403, 'scope_denied');
    return { connection: c, headers, path, method, now };
  }

  private incomingKey(
    c: SparkyGymConnection,
    claim: boolean,
    revoke = false
  ): Buffer {
    const secrets = openSecrets(c.id, c.credentials_encrypted);
    const key = claim
      ? secrets.invitation_secret
      : revoke && c.status === 'revoked' && secrets.revocation_receipt
        ? secrets.revocation_receipt.incoming_key
        : secrets.incoming_key;
    if (!key) throw new IntegrationError(401, 'invalid_signature');
    return Buffer.from(key, 'base64url');
  }

  verifyMediaHeaders(
    context: PeerContext,
    bodySha256: string | undefined
  ): void {
    if (
      context.path !== `${prefix}/media` ||
      !verifyMediaPreflight({
        bodySha256,
        keyId: context.headers.keyId,
        timestamp: context.headers.timestamp,
        signature: context.headers.signature,
        requestId: context.headers.requestId,
        secret: this.incomingKey(context.connection, false),
        nowSeconds: context.now,
      })
    )
      throw new IntegrationError(401, 'invalid_signature');
  }

  reply(
    context: PeerContext,
    status: number,
    value: unknown,
    connection = context.connection
  ): PeerReply {
    const body = Buffer.from(JSON.stringify(value));
    const secrets = openSecrets(
      connection.id,
      connection.credentials_encrypted
    );
    const secret =
      secrets.outgoing_key ??
      (connection.status === 'revoked' &&
      context.path === `${prefix}/revoke` &&
      context.method === 'POST' &&
      secrets.revocation_receipt?.request_id === context.headers.requestId
        ? secrets.revocation_receipt.outgoing_key
        : undefined) ??
      (context.path === `${prefix}/pair/claim`
        ? secrets.invitation_secret
        : undefined);
    if (!secret) throw new IntegrationError(401, 'invalid_signature');
    const keyId =
      context.path === `${prefix}/pair/claim` && !secrets.outgoing_key
        ? connection.id
        : `${connection.id}_sf`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {
      status,
      body,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-SparkyGym-Key-Id': keyId,
        'X-SparkyGym-Timestamp': timestamp,
        'X-SparkyGym-Request-Id': context.headers.requestId,
        'X-SparkyGym-Signature': signResponse(
          context.headers.requestId,
          status,
          body,
          keyId,
          timestamp,
          Buffer.from(secret, 'base64url')
        ),
      },
    };
  }

  async receive(context: PeerContext, raw: Buffer): Promise<PeerReply> {
    const { headers, path, method, now } = context;
    const key = this.incomingKey(
      context.connection,
      path === `${prefix}/pair/claim`,
      path === `${prefix}/revoke`
    );
    const authentic =
      path === `${prefix}/events`
        ? verifyRequest(
            raw,
            headers.keyId,
            headers.timestamp,
            headers.signature,
            key,
            now
          )
        : verifyControlRequest(
            method,
            path,
            raw,
            headers.keyId,
            headers.timestamp,
            headers.signature,
            key,
            headers.requestId,
            now
          );
    if (!authentic) throw new IntegrationError(401, 'invalid_signature');
    try {
      const result = await repository.withOwnerTransaction(
        context.connection.user_id,
        async (client) => {
          let c = await this.owned(
            client,
            context.connection.user_id,
            context.connection.id
          );
          if (c.status === 'revoked' && path !== `${prefix}/revoke`)
            throw new IntegrationError(401, 'connection_revoked');
          if (c.status === 'revoked') {
            const secrets = openSecrets(c.id, c.credentials_encrypted);
            const receipt = secrets.revocation_receipt;
            if (
              method !== 'POST' ||
              (receipt
                ? receipt.request_id !== headers.requestId ||
                  receipt.body_sha256 !== digest(raw)
                : !secrets.incoming_key)
            )
              throw new IntegrationError(401, 'invalid_signature');
          }
          if (path === `${prefix}/pair/claim`) {
            const claim = sparkyGymPairClaimSchema.parse(json(raw));
            const secrets = openSecrets(c.id, c.credentials_encrypted);
            const stored = c.invitation_public;
            const offer = sparkyGymInvitationOfferSchema.parse({
              version: stored.version,
              connection_id: stored.connection_id,
              sf_owner_ref: stored.sf_owner_ref,
              sf_origin: stored.sf_origin,
              sf_nonce: stored.sf_nonce,
              peer_origin: stored.peer_origin,
              scopes: stored.scopes,
              include_history: stored.include_history,
              expires_at: stored.expires_at,
              secret: secrets.invitation_secret,
            });
            let keys: ReturnType<typeof derivePairKeys>;
            try {
              keys = derivePairKeys(offer, claim);
            } catch {
              throw new IntegrationError(422, 'pair_claim_mismatch');
            }
            if (c.claim) {
              if (
                JSON.stringify(sparkyGymPairClaimSchema.parse(c.claim)) !==
                JSON.stringify(claim)
              )
                throw new IntegrationError(409, 'claim_conflict');
            } else {
              if (
                c.status !== 'pending' ||
                !c.expires_at ||
                c.expires_at.getTime() <= Date.now()
              )
                throw new IntegrationError(409, 'invitation_expired');
              c = (await repository.updateConnection(
                c.user_id,
                c.id,
                {
                  status: 'claimed',
                  peer_user_id: claim.og_owner_ref,
                  claim,
                  credentials_encrypted: sealSecrets(c.id, {
                    ...secrets,
                    og_nonce: claim.og_nonce,
                    root_key: keys.root.toString('base64url'),
                    outgoing_key: keys.outgoing.toString('base64url'),
                    incoming_key: keys.incoming.toString('base64url'),
                  }),
                },
                client
              ))!;
              await repository.appendNotification(
                c.user_id,
                'connection',
                { connection_id: c.id, status: 'claimed' },
                client
              );
            }
            return {
              value: { connection: await this.publicStatus(client, c, true) },
              connection: c,
            };
          }
          if (path === `${prefix}/pair/accept`)
            throw new IntegrationError(405, 'wrong_pairing_role');
          if (path === `${prefix}/capabilities`)
            return { value: capabilities, connection: c };
          if (path !== `${prefix}/revoke`) {
            if (c.status === 'activating' || c.status === 'paused')
              throw new IntegrationError(
                503,
                c.status === 'paused'
                  ? 'connection_paused'
                  : 'activation_pending'
              );
            if (c.status !== 'active')
              throw new IntegrationError(403, 'approval_required');
          }
          if (path === `${prefix}/events`) {
            const event = sparkyGymDomainEventSchema.parse(json(raw));
            if (
              event.connection_id !== c.id ||
              event.event_id !== headers.requestId ||
              !c.scopes.includes(event.resource)
            )
              throw new IntegrationError(403, 'scope_denied');
            const receipt = await repository.receiveEvent(
              c.user_id,
              event,
              digest(raw),
              (tx, accepted) =>
                applySparkyGymProjection(tx, c.user_id, peerRef(c), accepted),
              client
            );
            return { value: receipt, connection: c };
          }
          const hash = digest(
            Buffer.concat([Buffer.from(`${method}\n${path}\n`), raw])
          );
          const prior = await client.query<{
            body_sha256: string;
            receipt: repository.JsonObject;
          }>(
            'SELECT body_sha256,receipt FROM sparkygym_inbox WHERE user_id=$1 AND connection_id=$2 AND request_id=$3',
            [c.user_id, c.id, headers.requestId]
          );
          if (prior.rows[0]) {
            if (!sameBodyDigest(prior.rows[0].body_sha256, hash))
              throw new IntegrationError(409, 'request_conflict');
            return { value: prior.rows[0].receipt, connection: c };
          }
          let value: repository.JsonObject;
          if (path === `${prefix}/revoke`) {
            const packet = revokeSchema.parse(json(raw));
            if (packet.connection_id !== c.id)
              throw new IntegrationError(403, 'connection_mismatch');
            const secrets = openSecrets(c.id, c.credentials_encrypted);
            if (!secrets.incoming_key || !secrets.outgoing_key)
              throw new IntegrationError(401, 'invalid_signature');
            c = (await repository.updateConnection(
              c.user_id,
              c.id,
              {
                status: 'revoked',
                last_error: 'peer_revoked',
                credentials_encrypted: sealSecrets(c.id, {
                  version: 1,
                  sf_nonce: secrets.sf_nonce,
                  revocation_receipt: {
                    request_id: headers.requestId,
                    body_sha256: digest(raw),
                    incoming_key: secrets.incoming_key,
                    outgoing_key: secrets.outgoing_key,
                  },
                }),
              },
              client
            ))!;
            // Authenticated bilateral revocation proves completion even if our HTTP ACK was lost.
            await client.query(
              `UPDATE sparkygym_outbox SET status='delivered',receipt=$3,last_error=NULL,
               lease_token=NULL,leased_until=NULL,updated_at=now()
               WHERE user_id=$1 AND connection_id=$2 AND status='pending'
               AND kind='control' AND method='POST' AND path='/api/integrations/v1/revoke'`,
              [
                c.user_id,
                c.id,
                JSON.stringify({
                  version: 1,
                  status: 'peer_revocation_proof',
                  request_id: headers.requestId,
                  body_sha256: digest(raw),
                }),
              ]
            );
            await repository.appendNotification(
              c.user_id,
              'connection',
              { connection_id: c.id, status: 'revoked' },
              client
            );
            value = { connection: await this.publicStatus(client, c, true) };
          } else if (path === `${prefix}/snapshot`) {
            const packet = sparkyGymPeerSnapshotControlSchema.parse(json(raw));
            if (packet.connection_id !== c.id)
              throw new IntegrationError(403, 'connection_mismatch');
            value = sparkyGymPeerSnapshotResponseSchema.parse(
              await handleSnapshot(client, c, packet)
            );
            if (packet.action === 'complete')
              await this.finishRotation(client, c);
          } else if (path === `${prefix}/media`) {
            const decoded = decodeMediaFrame(raw);
            if (
              decoded.metadata.connection_id !== c.id ||
              decoded.metadata.request_id !== headers.requestId
            )
              throw new IntegrationError(403, 'connection_mismatch');
            const media = await client.query<{
              local_id: string;
              sha256: string;
              bytes: string;
              mime: string;
            }>(
              `SELECT e.local_id,m.sha256,m.bytes,m.mime FROM sparkygym_entities e JOIN sparkygym_media m ON m.user_id=e.user_id AND m.id::text=e.local_id
             WHERE e.user_id=$1 AND e.peer_ref=$2 AND e.resource='personal_media' AND e.entity_id=$3 AND NOT e.tombstone AND m.status<>'detached'`,
              [c.user_id, peerRef(c), decoded.metadata.media_id]
            );
            const target = media.rows[0];
            if (!target)
              throw new IntegrationError(503, 'media_metadata_pending');
            if (
              target.sha256 !== decoded.metadata.sha256 ||
              Number(target.bytes) !== decoded.metadata.bytes ||
              target.mime !== decoded.metadata.mime
            )
              throw new IntegrationError(409, 'media_metadata_conflict');
            const private_path = persistArchive(
              privateArchiveRoot(),
              c.user_id,
              decoded
            );
            await markSparkyGymMediaReady(client, c.user_id, target.local_id, {
              ...decoded.metadata,
              private_path,
            });
            value = {
              version: 1,
              media_id: decoded.metadata.media_id,
              status: 'ready',
              sha256: decoded.metadata.sha256,
            };
          } else throw new IntegrationError(404, 'unknown_peer_operation');
          await client.query(
            'INSERT INTO sparkygym_inbox(user_id,connection_id,request_id,body_sha256,receipt) VALUES($1,$2,$3,$4,$5)',
            [c.user_id, c.id, headers.requestId, hash, JSON.stringify(value)]
          );
          return { value, connection: c };
        }
      );
      this.wake();
      return this.reply(context, 200, result.value, result.connection);
    } catch (error) {
      const status =
        error instanceof z.ZodError || error instanceof SyntaxError
          ? 422
          : error instanceof IntegrationError ||
              error instanceof repository.SparkyGymConflict ||
              error instanceof repository.SparkyGymActivationPending
            ? error.statusCode
            : 500;
      const code =
        error instanceof IntegrationError
          ? error.code
          : error instanceof repository.SparkyGymConflict
            ? (safeError(error.code) ?? 'event_conflict')
            : error instanceof repository.SparkyGymActivationPending
              ? error.code
              : status === 422
                ? 'invalid_payload'
                : 'receiver_error';
      if (code === 'source_rewind')
        await repository.withOwnerTransaction(
          context.connection.user_id,
          async (client) => {
            const current = await this.owned(
              client,
              context.connection.user_id,
              context.connection.id
            );
            if (current.status !== 'revoked')
              await repository.updateConnection(
                current.user_id,
                current.id,
                { status: 'paused', last_error: 'source_rewind' },
                client
              );
            await repository.appendNotification(
              current.user_id,
              'connection',
              {
                connection_id: current.id,
                status: 'paused',
                error: 'source_rewind',
              },
              client
            );
          }
        );
      return this.reply(context, status, { error: { code } });
    }
  }

  async deliver(job: SparkyGymOutbox, signal: AbortSignal): Promise<void> {
    const c = await repository.withOwnerTransaction(job.user_id, (client) =>
      this.owned(client, job.user_id, job.connection_id)
    );
    const allowed =
      c.status === 'active' ||
      (c.status === 'activating' && job.path === `${prefix}/pair/accept`) ||
      (c.status === 'revoked' && job.path === `${prefix}/revoke`);
    if (!allowed) {
      await repository.failOutbox(
        job.user_id,
        job.id,
        'connection_paused',
        new Date(Date.now() + 1000),
        undefined,
        job.lease_token ?? undefined
      );
      return;
    }
    const secrets = openSecrets(c.id, c.credentials_encrypted);
    if (!secrets.outgoing_key || !secrets.incoming_key) {
      await repository.pauseOutbox(
        job.user_id,
        job.id,
        'credentials_unavailable',
        job.lease_token ?? undefined
      );
      return;
    }
    const body = job.body_bytes
      ? Buffer.from(job.body_bytes)
      : Buffer.from(job.body);
    if (body.length > (job.kind === 'media' ? 104923140 : 1048576)) {
      await repository.failOutbox(
        job.user_id,
        job.id,
        'payload_too_large',
        null,
        undefined,
        job.lease_token ?? undefined
      );
      await this.notifyDelivery(job);
      return;
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const keyId = `${c.id}_sf`;
    const secret = Buffer.from(secrets.outgoing_key, 'base64url');
    const signature =
      job.kind === 'event'
        ? signRequest(body, keyId, timestamp, secret)
        : signControlRequest(
            job.method,
            job.path,
            body,
            keyId,
            timestamp,
            secret,
            job.request_id
          );
    try {
      if (signal.aborted) throw new Error('delivery_aborted');
      const response = await requestPeer({
        origin: c.peer_origin,
        policy: policy(c),
        method: job.method,
        path: job.path,
        body,
        signal,
        headers: {
          'Content-Type':
            job.kind === 'media'
              ? 'application/octet-stream'
              : 'application/json',
          'X-SparkyGym-Key-Id': keyId,
          'X-SparkyGym-Timestamp': timestamp,
          'X-SparkyGym-Signature': signature,
          'X-SparkyGym-Request-Id': job.request_id,
          ...(job.kind === 'media'
            ? { 'X-SparkyGym-Body-Sha256': digest(body) }
            : {}),
        },
      });
      const header = (name: string) =>
        typeof response.headers[name] === 'string'
          ? response.headers[name]
          : undefined;
      const authentic =
        header('x-sparkygym-key-id') === `${c.id}_og` &&
        header('x-sparkygym-request-id') === job.request_id &&
        verifyResponse(
          job.request_id,
          response.status,
          response.body,
          header('x-sparkygym-key-id'),
          header('x-sparkygym-timestamp'),
          header('x-sparkygym-signature'),
          Buffer.from(secrets.incoming_key, 'base64url')
        );
      if (!authentic || response.status < 200 || response.status >= 300) {
        const category = classifyDeliveryFailure(response.status, authentic);
        if (category === 'pause')
          await repository.pauseOutbox(
            job.user_id,
            job.id,
            authentic && response.status === 409
              ? 'peer_conflict'
              : 'peer_authentication_failed',
            job.lease_token ?? undefined
          );
        else
          await repository.failOutbox(
            job.user_id,
            job.id,
            authentic ? 'peer_payload_rejected' : 'unverified_peer_response',
            category === 'terminal'
              ? null
              : new Date(
                  retryDeadline(job.attempts, Date.now(), header('retry-after'))
                ),
            undefined,
            job.lease_token ?? undefined
          );
        await this.notifyDelivery(job);
        return;
      }
      const payload = json(response.body);
      let receipt: repository.JsonObject;
      if (job.kind === 'event') {
        const parsed = sparkyGymReceiptSchema.parse(payload);
        if (
          parsed.event_id !== job.request_id ||
          parsed.revision < (job.revision ?? 0)
        )
          throw new Error('receipt_mismatch');
        receipt = parsed;
      } else if (
        job.path === `${prefix}/pair/accept` ||
        job.path === `${prefix}/revoke`
      ) {
        const parsed = sparkyGymControlResponseSchema.parse(payload);
        if (
          parsed.connection.connection_id !== c.id ||
          parsed.connection.status !==
            (job.path.endsWith('/revoke') ? 'revoked' : 'active')
        )
          throw new Error('receipt_mismatch');
        receipt = parsed;
      } else if (job.path === `${prefix}/snapshot`)
        receipt = sparkyGymPeerSnapshotResponseSchema.parse(payload);
      else if (job.path === `${prefix}/capabilities`)
        receipt = sparkyGymCapabilitiesSchema.parse(payload);
      else receipt = z.record(z.string(), z.json()).parse(payload);
      await repository.withOwnerTransaction(job.user_id, async (client) => {
        const current = await this.owned(client, job.user_id, c.id);
        const acknowledged = await repository.acknowledgeOutbox(
          job.user_id,
          job.id,
          receipt,
          client,
          job.lease_token ?? undefined
        );
        if (!acknowledged) return;
        if (
          job.path === `${prefix}/pair/accept` &&
          current.status !== 'revoked' &&
          !current.activated_at
        ) {
          const activated = (await repository.confirmActivation(
            job.user_id,
            c.id,
            client
          ))!;
          await repository.enqueueControl(
            job.user_id,
            {
              connection_id: c.id,
              method: 'GET',
              path: `${prefix}/capabilities`,
              body: '',
            },
            client
          );
          if (activated.status === 'active')
            await this.queueSnapshots(
              client,
              activated,
              activated.invitation_public.include_history === true
            );
          else
            await repository.updateConnection(
              job.user_id,
              c.id,
              { last_error: 'initial_snapshot_pending' },
              client
            );
          if (activated.replaces_connection_id) {
            // Old unacknowledged work is retained; no old packet is rewritten or discarded.
            await repository.updateConnection(
              job.user_id,
              activated.replaces_connection_id,
              { status: 'paused', last_error: 'rotation_snapshot_pending' },
              client
            );
          }
        }
        if (job.path === `${prefix}/revoke` && current.status === 'revoked') {
          const latestSecrets = openSecrets(
            current.id,
            current.credentials_encrypted
          );
          await repository.updateConnection(
            job.user_id,
            current.id,
            {
              credentials_encrypted: sealSecrets(current.id, {
                version: 1,
                sf_nonce: latestSecrets.sf_nonce,
                revocation_receipt: latestSecrets.revocation_receipt,
              }),
            },
            client
          );
        }
        if (job.path === `${prefix}/capabilities`) {
          const peerCaps = sparkyGymCapabilitiesSchema.parse(receipt);
          if (
            !current.scopes.every((scope) => peerCaps.resources.includes(scope))
          )
            await repository.updateConnection(
              job.user_id,
              current.id,
              {
                status: current.status === 'revoked' ? 'revoked' : 'paused',
                last_error: 'peer_capabilities_mismatch',
              },
              client
            );
          await repository.updateConnection(
            job.user_id,
            current.id,
            {
              invitation_public: {
                ...current.invitation_public,
                peer_capabilities: peerCaps,
              },
            },
            client
          );
        }
        if (
          job.path === `${prefix}/snapshot` &&
          z.object({ action: z.string() }).parse(json(body)).action ===
            'complete'
        )
          await this.finishRotation(client, current);
        await repository.appendNotification(
          job.user_id,
          'connection',
          { connection_id: c.id, delivery: 'committed' },
          client
        );
      });
    } catch {
      await repository.failOutbox(
        job.user_id,
        job.id,
        signal.aborted ? 'delivery_interrupted' : 'peer_unavailable',
        new Date(retryDeadline(job.attempts, Date.now())),
        undefined,
        job.lease_token ?? undefined
      );
      await this.notifyDelivery(job);
    }
  }

  private async notifyDelivery(job: SparkyGymOutbox): Promise<void> {
    await repository.withOwnerTransaction(job.user_id, (client) =>
      repository.appendNotification(
        job.user_id,
        'connection',
        { connection_id: job.connection_id, delivery: 'changed' },
        client
      )
    );
  }

  private async finishRotation(
    client: PoolClient,
    c: SparkyGymConnection
  ): Promise<void> {
    if (
      !c.replaces_connection_id ||
      c.status !== 'active' ||
      c.invitation_public.include_history !== true
    )
      return;
    const sent = await client.query(
      `SELECT id FROM sparkygym_outbox WHERE user_id=$1 AND connection_id=$2 AND status='delivered' AND path=$3 AND body::jsonb->>'action'='complete' LIMIT 1
`,
      [c.user_id, c.id, `${prefix}/snapshot`]
    );
    if (!sent.rowCount) return;
    const incoming = c.scopes.filter((scope) =>
      ['exercise', 'workout', 'personal_media'].includes(scope)
    );
    if (incoming.length) {
      const received = await client.query(
        `SELECT snapshot_id FROM sparkygym_snapshots WHERE user_id=$1 AND connection_id=$2 AND status='complete' AND prune_resources @> $3::jsonb LIMIT 1
`,
        [c.user_id, c.id, JSON.stringify(incoming)]
      );
      if (!received.rowCount) return;
    }
    const old = await this.owned(client, c.user_id, c.replaces_connection_id);
    if (
      old.peer_user_id !== c.peer_user_id ||
      old.peer_origin !== c.peer_origin
    )
      throw new IntegrationError(409, 'rotation_peer_mismatch');
    const oldSecrets = openSecrets(old.id, old.credentials_encrypted);
    await repository.updateConnection(
      c.user_id,
      old.id,
      {
        status: 'revoked',
        last_error: 'superseded_by_confirmed_snapshot',
        credentials_encrypted: sealSecrets(old.id, {
          version: 1,
          sf_nonce: oldSecrets.sf_nonce,
          revocation_receipt: oldSecrets.revocation_receipt,
        }),
      },
      client
    );
    await client.query(
      `UPDATE sparkygym_outbox SET status='terminal',last_error='superseded_by_confirmed_snapshot',lease_token=NULL,leased_until=NULL,updated_at=now() WHERE user_id=$1 AND connection_id=$2 AND status='pending'
`,
      [c.user_id, old.id]
    );
    await repository.appendNotification(
      c.user_id,
      'connection',
      { connection_id: old.id, status: 'revoked', replaced_by: c.id },
      client
    );
  }
}

export const sparkyGymService = new SparkyGymService();
