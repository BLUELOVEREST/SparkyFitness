import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import {
  sparkyGymConnectionSchema,
  sparkyGymOutboxSchema,
  sparkyGymNotificationSchema,
  sparkyGymDomainEventSchema,
  type SparkyGymConnection,
  type SparkyGymDomainEvent,
  type SparkyGymReceipt,
  type SparkyGymResource,
  type SparkyGymOutbox,
} from '@workspace/shared';
import { getClient, getSystemClient } from '../db/poolManager.js';
import { sameBodyDigest } from '../integrations/opengym/protocol.js';

export type JsonObject = SparkyGymConnection['invitation_public'];
export type CreateConnection = Pick<
  SparkyGymConnection,
  | 'id'
  | 'self_origin'
  | 'peer_origin'
  | 'scopes'
  | 'credentials_encrypted'
  | 'invitation_public'
> &
  Partial<
    Pick<
      SparkyGymConnection,
      | 'peer_user_id'
      | 'status'
      | 'allow_private'
      | 'allow_http'
      | 'claim'
      | 'expires_at'
      | 'replaces_connection_id'
    >
  >;
export type UpdateConnection = Partial<Omit<CreateConnection, 'id'>> & {
  activated_at?: Date | null;
  last_error?: string | null;
};
export interface EnqueueControl {
  connection_id: string;
  request_id?: string;
  kind?: 'control' | 'event' | 'media';
  source_cursor?: number;
  path: string;
  method?: 'GET' | 'POST';
  body: string;
  body_bytes?: Uint8Array;
  resource?: SparkyGymResource;
  entity_id?: string;
  revision?: number;
}
export class SparkyGymConflict extends Error {
  readonly statusCode = 409;
  get code() {
    return this.message;
  }
}
export class SparkyGymActivationPending extends Error {
  readonly statusCode = 503;
  readonly code = 'activation_pending';
  constructor() {
    super('activation_pending');
  }
}

export async function withOwnerTransaction<T>(
  owner: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client: PoolClient = await getClient(owner, owner);
  try {
    await client.query('BEGIN');
    await lockOwnerSource(owner, client);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function ownerQuery<T extends QueryResultRow>(
  owner: string,
  sql: string,
  values: unknown[],
  client?: PoolClient
) {
  if (client) return client.query<T>(sql, values);
  const owned: PoolClient = await getClient(owner, owner);
  try {
    return await owned.query<T>(sql, values);
  } finally {
    owned.release();
  }
}
export async function listConnections(owner: string, client?: PoolClient) {
  const result = await ownerQuery(
    owner,
    'SELECT * FROM sparkygym_connections WHERE user_id=$1 ORDER BY created_at,id',
    [owner],
    client
  );
  return result.rows.map((row) => sparkyGymConnectionSchema.parse(row));
}
export async function getConnection(
  owner: string,
  id: string,
  client?: PoolClient
) {
  const result = await ownerQuery(
    owner,
    'SELECT * FROM sparkygym_connections WHERE user_id=$1 AND id=$2 FOR UPDATE',
    [owner, id],
    client
  );
  return result.rows[0]
    ? sparkyGymConnectionSchema.parse(result.rows[0])
    : null;
}
export async function createConnection(
  owner: string,
  input: CreateConnection,
  client?: PoolClient
) {
  const result = await ownerQuery(
    owner,
    `INSERT INTO sparkygym_connections
    (id,user_id,self_origin,peer_origin,peer_user_id,status,scopes,allow_private,allow_http,credentials_encrypted,invitation_public,claim,expires_at,replaces_connection_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      input.id,
      owner,
      input.self_origin,
      input.peer_origin,
      input.peer_user_id ?? null,
      input.status ?? 'pending',
      JSON.stringify(input.scopes),
      input.allow_private ?? false,
      input.allow_http ?? false,
      input.credentials_encrypted,
      JSON.stringify(input.invitation_public),
      input.claim ? JSON.stringify(input.claim) : null,
      input.expires_at ?? null,
      input.replaces_connection_id ?? null,
    ],
    client
  );
  return sparkyGymConnectionSchema.parse(result.rows[0]);
}
export async function updateConnection(
  owner: string,
  id: string,
  patch: UpdateConnection,
  client?: PoolClient
) {
  const allowed = [
    'self_origin',
    'peer_origin',
    'peer_user_id',
    'status',
    'scopes',
    'allow_private',
    'allow_http',
    'credentials_encrypted',
    'invitation_public',
    'claim',
    'expires_at',
    'replaces_connection_id',
    'last_error',
    'activated_at',
  ] as const;
  const entries = allowed
    .filter((key) => patch[key] !== undefined)
    .map(
      (key) =>
        [
          key,
          ['scopes', 'invitation_public', 'claim'].includes(key)
            ? JSON.stringify(patch[key])
            : patch[key],
        ] as const
    );
  if (!entries.length) return getConnection(owner, id, client);
  const result = await ownerQuery(
    owner,
    `UPDATE sparkygym_connections SET ${entries.map(([key], index) => `${key}=$${index + 3}`).join(',')},updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING *`,
    [owner, id, ...entries.map(([, value]) => value)],
    client
  );
  return result.rows[0]
    ? sparkyGymConnectionSchema.parse(result.rows[0])
    : null;
}
/** The function exposes only a single key's encrypted credential metadata. Never use the system pool here. */
export async function lookupPeerConnectionByKeyId(keyId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:_og)?$/i.test(
      keyId
    )
  )
    return null;
  const client: PoolClient = await getClient(
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000000'
  );
  try {
    const result = await client.query(
      'SELECT * FROM public.sparkygym_lookup_peer_key($1)',
      [keyId]
    );
    return result.rows[0]
      ? sparkyGymConnectionSchema.parse(result.rows[0])
      : null;
  } finally {
    client.release();
  }
}
/** Confirmation is independent of a concurrent owner's pause/revoke choice. */
export async function confirmActivation(
  owner: string,
  id: string,
  client?: PoolClient
) {
  const result = await ownerQuery(
    owner,
    `UPDATE sparkygym_connections SET activated_at=coalesce(activated_at,now()),status=CASE WHEN status='activating' THEN 'active' ELSE status END,updated_at=now() WHERE user_id=$1 AND id=$2 RETURNING *
`,
    [owner, id],
    client
  );
  return result.rows[0]
    ? sparkyGymConnectionSchema.parse(result.rows[0])
    : null;
}
export async function enqueueControl(
  owner: string,
  job: EnqueueControl,
  client?: PoolClient
): Promise<SparkyGymOutbox> {
  if (!client)
    return withOwnerTransaction(owner, (tx) => enqueueControl(owner, job, tx));
  await lockOwnerSource(owner, client);
  const result = await ownerQuery(
    owner,
    `INSERT INTO sparkygym_outbox
    (user_id,connection_id,kind,path,method,body,body_sha256,request_id,resource,entity_id,revision,source_cursor,body_bytes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12,nextval('public.sparkygym_outbox_source_cursor_seq')),$13) RETURNING *`,
    [
      owner,
      job.connection_id,
      job.kind ?? 'control',
      job.path,
      job.method ?? 'POST',
      job.body,
      createHash('sha256')
        .update(job.body_bytes ?? job.body)
        .digest('hex'),
      job.request_id ?? randomUUID(),
      job.resource ?? null,
      job.entity_id ?? null,
      job.revision ?? null,
      job.source_cursor ?? null,
      job.body_bytes ? Buffer.from(job.body_bytes) : null,
    ],
    client
  );
  return sparkyGymOutboxSchema.parse(result.rows[0]);
}
/** Background worker only: no request handlers may call these cross-owner scans. */
export async function listDueOutbox(_limit = 1) {
  const client: PoolClient = await getSystemClient();
  try {
    const result = await client.query(
      `WITH due AS (SELECT o.id FROM sparkygym_outbox o JOIN sparkygym_connections c ON (c.user_id,c.id)=(o.user_id,o.connection_id)
      WHERE o.status='pending' AND o.next_due_at<=now() AND (o.leased_until IS NULL OR o.leased_until<=now())
      AND (c.status='active' OR (o.kind='control' AND c.status IN ('claimed','activating')) OR (c.status='revoked' AND o.kind='control' AND o.path='/api/integrations/v1/revoke'))
      AND NOT EXISTS (SELECT 1 FROM sparkygym_outbox prior WHERE prior.user_id=o.user_id AND prior.connection_id=o.connection_id AND prior.status='pending' AND prior.source_cursor<o.source_cursor AND (c.status<>'revoked' OR (prior.kind='control' AND prior.path='/api/integrations/v1/revoke')))
      ORDER BY o.source_cursor FOR UPDATE OF o SKIP LOCKED LIMIT 1)
      UPDATE sparkygym_outbox o SET lease_token=$1,leased_until=now()+interval '90 seconds',updated_at=now()
      FROM due WHERE o.id=due.id RETURNING o.*`,
      [randomUUID()]
    );
    return result.rows.map((row) => sparkyGymOutboxSchema.parse(row));
  } finally {
    client.release();
  }
}
export async function getNextDueWorker(): Promise<Date | null> {
  const client: PoolClient = await getSystemClient();
  try {
    const result = await client.query<{
      next_due_at: Date | null;
    }>(`SELECT min(greatest(o.next_due_at,coalesce(o.leased_until,o.next_due_at))) AS next_due_at FROM sparkygym_outbox o JOIN sparkygym_connections c ON (c.user_id,c.id)=(o.user_id,o.connection_id)
      WHERE o.status='pending' AND (c.status='active' OR (o.kind='control' AND c.status IN ('claimed','activating')) OR (c.status='revoked' AND o.kind='control' AND o.path='/api/integrations/v1/revoke'))
      AND NOT EXISTS (SELECT 1 FROM sparkygym_outbox prior WHERE prior.user_id=o.user_id AND prior.connection_id=o.connection_id AND prior.status='pending' AND prior.source_cursor<o.source_cursor AND (c.status<>'revoked' OR (prior.kind='control' AND prior.path='/api/integrations/v1/revoke')))`);
    return result.rows[0]?.next_due_at ?? null;
  } finally {
    client.release();
  }
}
export async function acknowledgeOutbox(
  owner: string,
  id: string,
  receipt: JsonObject,
  client?: PoolClient,
  leaseToken?: string
) {
  const result = await ownerQuery(
    owner,
    `UPDATE sparkygym_outbox SET status='delivered',receipt=$3,last_error=NULL,lease_token=NULL,leased_until=NULL,updated_at=now() WHERE user_id=$1 AND id=$2 AND status='pending' AND lease_token IS NOT DISTINCT FROM $4::uuid
`,
    [owner, id, JSON.stringify(receipt), leaseToken ?? null],
    client
  );
  return result.rowCount === 1;
}
export async function failOutbox(
  owner: string,
  id: string,
  error: string,
  nextDue: Date | null,
  client?: PoolClient,
  leaseToken?: string
) {
  const result = await ownerQuery(
    owner,
    `UPDATE sparkygym_outbox SET attempts=attempts+1,status=$3,last_error=$4,next_due_at=coalesce($5,next_due_at),lease_token=NULL,leased_until=NULL,updated_at=now() WHERE user_id=$1 AND id=$2 AND status='pending' AND lease_token IS NOT DISTINCT FROM $6::uuid
`,
    [
      owner,
      id,
      nextDue ? 'pending' : 'terminal',
      error,
      nextDue,
      leaseToken ?? null,
    ],
    client
  );
  return result.rowCount === 1;
}
export async function pauseOutbox(
  owner: string,
  id: string,
  error: string,
  leaseToken?: string
) {
  return withOwnerTransaction(owner, async (client) => {
    const result = await client.query<{ connection_id: string }>(
      `UPDATE sparkygym_outbox SET attempts=attempts+1,last_error=$3,lease_token=NULL,leased_until=NULL,updated_at=now() WHERE user_id=$1 AND id=$2 AND status='pending' AND lease_token IS NOT DISTINCT FROM $4::uuid RETURNING connection_id
`,
      [owner, id, error, leaseToken ?? null]
    );
    if (result.rows[0])
      await client.query(
        `UPDATE sparkygym_connections SET status=CASE WHEN status='revoked' THEN status ELSE 'paused' END,last_error=$3,updated_at=now() WHERE user_id=$1 AND id=$2
`,
        [owner, result.rows[0].connection_id, error]
      );
  });
}
export async function appendNotification(
  owner: string,
  resource: string,
  payload: JsonObject,
  client?: PoolClient
) {
  const result = await ownerQuery(
    owner,
    'INSERT INTO sparkygym_notifications(user_id,resource,payload) VALUES($1,$2,$3) RETURNING *',
    [owner, resource, JSON.stringify(payload)],
    client
  );
  return sparkyGymNotificationSchema.parse(result.rows[0]);
}
export async function replayNotifications(
  owner: string,
  after = '0',
  limit = 200,
  client?: PoolClient
) {
  const result = await ownerQuery(
    owner,
    'SELECT * FROM sparkygym_notifications WHERE user_id=$1 AND id>$2::bigint ORDER BY id LIMIT $3',
    [owner, after, limit],
    client
  );
  return result.rows.map((row) => sparkyGymNotificationSchema.parse(row));
}
export async function replayNotificationPage(
  owner: string,
  after = '0',
  limit = 200,
  client?: PoolClient
) {
  if (!/^\d{1,19}$/.test(after) || BigInt(after) > 9223372036854775807n)
    throw new SparkyGymConflict('Invalid notification cursor');
  const read = async (tx: PoolClient) => {
    const bounds = await tx.query<{
      first_cursor: string | null;
      last_cursor: string | null;
      has_cursor: boolean;
    }>(
      `SELECT min(id)::text AS first_cursor,max(id)::text AS last_cursor,
      EXISTS(SELECT 1 FROM sparkygym_notifications n WHERE n.user_id=$1 AND n.id=$2::bigint) AS has_cursor
      FROM sparkygym_notifications WHERE user_id=$1`,
      [owner, after]
    );
    const last = bounds.rows[0]?.last_cursor ?? '0';
    if (BigInt(after) !== 0n && !bounds.rows[0]?.has_cursor)
      return { snapshot_required: true, notifications: [], last_cursor: last };
    return {
      snapshot_required: false,
      notifications: await replayNotifications(owner, after, limit, tx),
      last_cursor: last,
    };
  };
  if (client) return read(client);
  return withOwnerTransaction(owner, async (tx) => {
    return read(tx);
  });
}
export async function receiveEvent(
  owner: string,
  input: SparkyGymDomainEvent,
  hash: string,
  apply: (client: PoolClient, event: SparkyGymDomainEvent) => Promise<void>,
  client?: PoolClient
): Promise<SparkyGymReceipt> {
  const event = sparkyGymDomainEventSchema.parse(input);
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw new SparkyGymConflict('Invalid body hash');
  const work = async (tx: PoolClient): Promise<SparkyGymReceipt> => {
    const connection = await getConnection(owner, event.connection_id, tx);
    if (connection?.status === 'activating')
      throw new SparkyGymActivationPending();
    if (
      !connection ||
      connection.status !== 'active' ||
      !connection.peer_user_id ||
      !connection.scopes.includes(event.resource) ||
      event.producer !== 'opengym'
    )
      throw new SparkyGymConflict(
        'Connection is not authorized for this resource'
      );
    const peer = `${connection.peer_origin}\n${connection.peer_user_id}`;
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `sparkygym:${owner}:${peer}`,
    ]);
    const prior = await tx.query<{
      body_sha256: string;
      receipt: SparkyGymReceipt;
    }>(
      'SELECT body_sha256,receipt FROM sparkygym_inbox WHERE user_id=$1 AND connection_id=$2 AND request_id=$3',
      [owner, event.connection_id, event.event_id]
    );
    if (prior.rows[0]) {
      if (!sameBodyDigest(prior.rows[0].body_sha256, hash))
        throw new SparkyGymConflict('Request ID reused with different bytes');
      await recordSnapshotMembership(owner, peer, event, tx);
      return { ...prior.rows[0].receipt, status: 'duplicate' };
    }
    const stream = await tx.query<{ revision: string }>(
      `SELECT revision FROM sparkygym_streams WHERE user_id=$1 AND connection_id=$2 AND direction='in' AND resource=$3 AND entity_id=$4 FOR UPDATE
`,
      [owner, event.connection_id, event.resource, event.entity_id]
    );
    const currentRevision = Number(stream.rows[0]?.revision ?? 0);
    if (currentRevision === event.revision)
      throw new SparkyGymConflict('event_conflict');
    const sourceHead = await getSourceHead(owner, peer, tx);
    if (sourceHead >= event.source_cursor)
      throw new SparkyGymConflict('source_rewind');
    const stale = currentRevision > event.revision;
    if (!stale) {
      await apply(tx, event);
      await tx.query(
        `INSERT INTO sparkygym_streams(user_id,connection_id,peer_ref,direction,resource,entity_id,revision) VALUES($1,$2,$3,'in',$4,$5,$6)
        ON CONFLICT(user_id,connection_id,direction,resource,entity_id) DO UPDATE SET revision=EXCLUDED.revision,updated_at=now()`,
        [
          owner,
          event.connection_id,
          peer,
          event.resource,
          event.entity_id,
          event.revision,
        ]
      );
      const sourceCursor =
        'source_cursor' in event ? event.source_cursor : null;
      if (
        typeof sourceCursor !== 'number' ||
        !Number.isSafeInteger(sourceCursor) ||
        sourceCursor <= 0
      )
        throw new SparkyGymConflict('Missing source cursor');
      const projection = await tx.query(
        `INSERT INTO sparkygym_entities(user_id,peer_ref,resource,entity_id,raw_payload,tombstone,last_source_cursor) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(user_id,peer_ref,resource,entity_id) DO UPDATE SET raw_payload=EXCLUDED.raw_payload,tombstone=EXCLUDED.tombstone,last_source_cursor=EXCLUDED.last_source_cursor,updated_at=now()
        WHERE sparkygym_entities.last_source_cursor<EXCLUDED.last_source_cursor RETURNING entity_id`,
        [
          owner,
          peer,
          event.resource,
          event.entity_id,
          event.payload ? JSON.stringify(event.payload) : null,
          event.operation === 'delete',
          sourceCursor,
        ]
      );
      if (!projection.rows[0]) throw new SparkyGymConflict('source_rewind');
      await appendNotification(
        owner,
        event.resource,
        { entity_id: event.entity_id, operation: event.operation },
        tx
      );
    }
    const receipt: SparkyGymReceipt = {
      version: 1,
      event_id: event.event_id,
      status: stale ? 'stale' : 'applied',
      revision: stale ? currentRevision : event.revision,
    };
    await tx.query(
      'INSERT INTO sparkygym_inbox(user_id,connection_id,request_id,body_sha256,receipt) VALUES($1,$2,$3,$4,$5)',
      [
        owner,
        event.connection_id,
        event.event_id,
        hash,
        JSON.stringify(receipt),
      ]
    );
    await advanceSourceHead(owner, peer, event.source_cursor, tx);
    await recordSnapshotMembership(owner, peer, event, tx);
    return receipt;
  };
  return client ? work(client) : withOwnerTransaction(owner, work);
}
export async function getSourceHead(
  owner: string,
  peerRef: string,
  client?: PoolClient
): Promise<number> {
  const result = await ownerQuery<{ last_source_cursor: string }>(
    owner,
    'SELECT last_source_cursor FROM sparkygym_source_heads WHERE user_id=$1 AND peer_ref=$2',
    [owner, peerRef],
    client
  );
  return Number(result.rows[0]?.last_source_cursor ?? 0);
}
/** Call for a completed snapshot only AFTER membership validation; never at begin.
 * GREATEST preserves already-applied post-watermark live deltas. */
export async function advanceSourceHead(
  owner: string,
  peerRef: string,
  cursor: number,
  client?: PoolClient
): Promise<void> {
  if (!Number.isSafeInteger(cursor) || cursor <= 0)
    throw new SparkyGymConflict('Invalid source cursor');
  if (!client)
    return withOwnerTransaction(owner, (tx) =>
      advanceSourceHead(owner, peerRef, cursor, tx)
    );
  await ownerQuery(
    owner,
    `INSERT INTO sparkygym_source_heads(user_id,peer_ref,last_source_cursor) VALUES($1,$2,$3)
    ON CONFLICT(user_id,peer_ref) DO UPDATE SET last_source_cursor=greatest(sparkygym_source_heads.last_source_cursor,EXCLUDED.last_source_cursor),updated_at=now()`,
    [owner, peerRef, cursor],
    client
  );
}
async function recordSnapshotMembership(
  owner: string,
  peer: string,
  event: SparkyGymDomainEvent,
  client: PoolClient
) {
  await client.query(
    `INSERT INTO sparkygym_snapshot_members(user_id,connection_id,snapshot_id,resource,entity_id)
    SELECT s.user_id,s.connection_id,s.snapshot_id,$4,$5 FROM sparkygym_snapshots s
    WHERE s.user_id=$1 AND s.connection_id=$2 AND s.peer_ref=$3 AND s.status='open'
      AND $6::bigint BETWEEN s.start_cursor AND s.watermark
    ON CONFLICT(user_id,connection_id,snapshot_id,resource,entity_id) DO NOTHING`,
    [
      owner,
      event.connection_id,
      peer,
      event.resource,
      event.entity_id,
      event.source_cursor,
    ]
  );
}
export async function lockOwnerSource(owner: string, client: PoolClient) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `sparkygym-owner:${owner}`,
  ]);
}
/** Reserve before serializing an immutable event/snapshot packet. Never derive from MAX(outbox). */
export async function reserveSourceCursor(client: PoolClient): Promise<number> {
  const result = await client.query<{ cursor: string }>(
    `SELECT nextval('public.sparkygym_outbox_source_cursor_seq')::text AS cursor
`
  );
  const cursor = Number(result.rows[0]?.cursor);
  if (!Number.isSafeInteger(cursor) || cursor <= 0)
    throw new SparkyGymConflict('source_cursor_exhausted');
  return cursor;
}
export interface BodySnapshotItem {
  resource: SparkyGymResource;
  entity_id: string;
  payload: JsonObject;
}
export async function captureBodySnapshot(
  client: PoolClient
): Promise<BodySnapshotItem[]> {
  const result = await client.query<BodySnapshotItem>(
    `SELECT * FROM public.sparkygym_body_snapshot()
     UNION ALL SELECT * FROM public.sparkygym_schedule_snapshot() ORDER BY resource,entity_id`
  );
  return result.rows;
}
/** Owner boundary stabilizes committed source rows; use plain MVCC reads in capture.
 * READ COMMITTED deliberately takes its source snapshot AFTER any lock wait. */
export async function enqueueSnapshot<T>(
  owner: string,
  connectionId: string,
  capture: (client: PoolClient) => Promise<T>,
  enqueue: (
    client: PoolClient,
    snapshot: T,
    snapshotId: string
  ) => Promise<void>
) {
  return withOwnerTransaction(owner, async (client) => {
    await lockOwnerSource(owner, client);
    const result = await client.query(
      'SELECT * FROM sparkygym_connections WHERE user_id=$1 AND id=$2',
      [owner, connectionId]
    );
    const connection = result.rows[0]
      ? sparkyGymConnectionSchema.parse(result.rows[0])
      : null;
    if (!connection || connection.status !== 'active')
      throw new SparkyGymConflict('Snapshot requires an active connection');
    const snapshotId = randomUUID();
    const snapshot = await capture(client);
    await enqueue(client, snapshot, snapshotId);
    return snapshotId;
  });
}
