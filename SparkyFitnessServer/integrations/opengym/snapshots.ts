import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient, QueryResult } from 'pg';
import { z } from 'zod';
import {
  sparkyGymDomainEventSchema,
  sparkyGymPeerSnapshotControlSchema,
  sparkyGymPeerSnapshotBeginSchema,
  type SparkyGymConnection,
  type SparkyGymResource,
} from '@workspace/shared';
import * as repository from '../../models/sparkyGymRepository.js';
import type { BodySnapshotItem } from '../../models/sparkyGymRepository.js';
import { applySparkyGymProjection } from './projections.js';

type Identity = { resource: string; entity_id: string };
type Control = z.infer<typeof sparkyGymPeerSnapshotControlSchema>;
type Begin = z.infer<typeof sparkyGymPeerSnapshotBeginSchema>;
const bodyResources = new Set<SparkyGymResource>([
  'body_definition',
  'body_measurement',
  'body_goal',
  'schedule_summary',
]);
const incomingResources = new Set<SparkyGymResource>([
  'exercise',
  'workout',
  'personal_media',
]);
const historicalResources = new Set<SparkyGymResource>([
  'body_measurement',
  'workout',
  'personal_media',
]);
const conflict = (code: string): never => {
  throw new repository.SparkyGymConflict(code);
};
const identityKey = (item: Identity) => `${item.resource}\0${item.entity_id}`;
const byteOrder = (a: string, b: string) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b));

export function membershipHash(items: readonly Identity[]): string {
  const keys = [...new Set(items.map(identityKey))].sort(byteOrder);
  const hash = createHash('sha256');
  for (const key of keys) hash.update(`${key}\n`);
  return hash.digest('hex');
}

export function selectCurrentBodyItems(
  items: readonly BodySnapshotItem[]
): BodySnapshotItem[] {
  const measurements = new Map<string, BodySnapshotItem>();
  const result: BodySnapshotItem[] = [];
  const order = (item: BodySnapshotItem) =>
    `${String(item.payload.date)}\0${String(item.payload.measured_at ?? '')}\0${item.entity_id}`;
  for (const item of items) {
    if (item.resource !== 'body_measurement') {
      result.push(item);
      continue;
    }
    const metric = String(item.payload.metric_id);
    const previous = measurements.get(metric);
    if (!previous || byteOrder(order(item), order(previous)) > 0)
      measurements.set(metric, item);
  }
  return [...result, ...measurements.values()];
}

/** Caller holds the owner advisory lock and commits all immutable packets together. */
export async function enqueueBodySnapshot(
  client: PoolClient,
  connection: SparkyGymConnection,
  includeHistory: boolean,
  coalesce = false
): Promise<string> {
  if (connection.status !== 'active' || !connection.peer_user_id)
    return conflict('connection_not_active');
  await repository.lockOwnerSource(connection.user_id, client);
  const prune = connection.scopes.filter(
    (resource) =>
      bodyResources.has(resource) &&
      (includeHistory || !historicalResources.has(resource))
  );
  if (coalesce) {
    const pending = await client.query<{ packet: unknown }>(
      `WITH packets AS MATERIALIZED (
         SELECT status,source_cursor,body::jsonb AS packet FROM sparkygym_outbox
         WHERE user_id=$1 AND connection_id=$2 AND path='/api/integrations/v1/snapshot'
       ) SELECT b.packet FROM packets b
       WHERE b.packet->>'action'='begin' AND b.status IN ('pending','delivered') AND EXISTS (
         SELECT 1 FROM packets p WHERE p.status='pending'
         AND p.packet->>'snapshot_id'=b.packet->>'snapshot_id'
         AND p.packet->>'action' IN ('begin','complete')
       ) ORDER BY b.source_cursor`,
      [connection.user_id, connection.id]
    );
    for (const { packet } of pending.rows) {
      const begin = sparkyGymPeerSnapshotBeginSchema.parse(packet);
      if (prune.every((resource) => begin.prune_resources.includes(resource)))
        return begin.snapshot_id;
    }
  }
  const captured = (await repository.captureBodySnapshot(client)).filter(
    (item) =>
      bodyResources.has(item.resource) &&
      connection.scopes.includes(item.resource)
  );
  const items = includeHistory ? captured : selectCurrentBodyItems(captured);
  if (
    items.length > 1000000 ||
    new Set(items.map(identityKey)).size !== items.length
  )
    return conflict('snapshot_identity_conflict');
  const snapshotId = randomUUID();
  const start = await repository.reserveSourceCursor(client);
  let watermark = start;
  for (const item of items) {
    const revision = await client.query<{ revision: string }>(
      `INSERT INTO sparkygym_streams(user_id,connection_id,peer_ref,direction,resource,entity_id,revision)
       VALUES($1,$2,$3,'out',$4,$5,1)
       ON CONFLICT(user_id,connection_id,direction,resource,entity_id)
       DO UPDATE SET revision=sparkygym_streams.revision+1,updated_at=now() RETURNING revision`,
      [
        connection.user_id,
        connection.id,
        `${connection.peer_origin}\n${connection.peer_user_id}`,
        item.resource,
        item.entity_id,
      ]
    );
    watermark = await repository.reserveSourceCursor(client);
    const event = sparkyGymDomainEventSchema.parse({
      version: 1,
      event_id: randomUUID(),
      connection_id: connection.id,
      producer: 'sparkyfitness',
      resource: item.resource,
      entity_id: item.entity_id,
      revision: Number(revision.rows[0]?.revision),
      source_cursor: watermark,
      operation: 'upsert',
      occurred_at: new Date().toISOString(),
      payload: item.payload,
    });
    await repository.enqueueControl(
      connection.user_id,
      {
        connection_id: connection.id,
        kind: 'event',
        path: '/api/integrations/v1/events',
        request_id: event.event_id,
        source_cursor: watermark,
        resource: event.resource,
        entity_id: event.entity_id,
        revision: event.revision,
        body: JSON.stringify(event),
      },
      client
    );
  }
  const begin = sparkyGymPeerSnapshotBeginSchema.parse({
    version: 1,
    action: 'begin',
    connection_id: connection.id,
    snapshot_id: snapshotId,
    start_cursor: start,
    watermark,
    expected_count: items.length,
    membership_sha256: membershipHash(items),
    prune_resources: prune,
  });
  // Insertion time is deliberately irrelevant: the reserved cursor places begin before every item.
  await repository.enqueueControl(
    connection.user_id,
    {
      connection_id: connection.id,
      path: '/api/integrations/v1/snapshot',
      source_cursor: start,
      body: JSON.stringify(begin),
    },
    client
  );
  await repository.enqueueControl(
    connection.user_id,
    {
      connection_id: connection.id,
      path: '/api/integrations/v1/snapshot',
      body: JSON.stringify({
        version: 1,
        action: 'complete',
        connection_id: connection.id,
        snapshot_id: snapshotId,
      }),
    },
    client
  );
  return snapshotId;
}

type SnapshotRow = {
  start_cursor: string;
  watermark: string;
  expected_count: number;
  membership_sha256: string;
  prune_resources: SparkyGymResource[];
  status: 'open' | 'complete' | 'failed';
};

async function incomingMembership(
  client: PoolClient,
  connection: SparkyGymConnection,
  snapshotId: string
) {
  const hash = createHash('sha256');
  let count = 0;
  let after: Identity | null = null;
  for (;;) {
    const page: QueryResult<Identity> = await client.query<Identity>(
      `SELECT resource,entity_id FROM sparkygym_snapshot_members
       WHERE user_id=$1 AND connection_id=$2 AND snapshot_id=$3
       AND ($4::text IS NULL OR (convert_to(resource,'UTF8'),convert_to(entity_id,'UTF8'))>
         (convert_to($4::text,'UTF8'),convert_to($5::text,'UTF8')))
       ORDER BY convert_to(resource,'UTF8'),convert_to(entity_id,'UTF8') LIMIT 1000`,
      [
        connection.user_id,
        connection.id,
        snapshotId,
        after?.resource ?? null,
        after?.entity_id ?? null,
      ]
    );
    for (const item of page.rows) {
      hash.update(`${identityKey(item)}\n`);
      count++;
    }
    if (page.rows.length < 1000) break;
    after = page.rows[page.rows.length - 1]!;
  }
  return { count, sha256: hash.digest('hex') };
}

function sameBegin(row: SnapshotRow, packet: Begin): boolean {
  return (
    Number(row.start_cursor) === packet.start_cursor &&
    Number(row.watermark) === packet.watermark &&
    row.expected_count === packet.expected_count &&
    row.membership_sha256 === packet.membership_sha256 &&
    JSON.stringify([...row.prune_resources].sort()) ===
      JSON.stringify([...packet.prune_resources].sort())
  );
}

/** Runs inside the HMAC handler's owner transaction, including its durable receipt. */
export async function handleSnapshot(
  client: PoolClient,
  connection: SparkyGymConnection,
  raw: Control
) {
  const packet = sparkyGymPeerSnapshotControlSchema.parse(raw);
  if (packet.connection_id !== connection.id || !connection.peer_user_id)
    return conflict('snapshot_connection_mismatch');
  if (connection.status !== 'active') return conflict('connection_not_active');
  const peer = `${connection.peer_origin}\n${connection.peer_user_id}`;
  if (packet.action === 'request') {
    if (
      packet.include_history &&
      connection.invitation_public.include_history !== true
    )
      return conflict('history_not_authorized');
    const id = await enqueueBodySnapshot(
      client,
      connection,
      packet.include_history,
      true
    );
    return {
      version: 1 as const,
      snapshot_id: id,
      status: 'snapshot_queued' as const,
    };
  }
  const existing = await client.query<SnapshotRow>(
    'SELECT * FROM sparkygym_snapshots WHERE user_id=$1 AND connection_id=$2 AND snapshot_id=$3 FOR UPDATE',
    [connection.user_id, connection.id, packet.snapshot_id]
  );
  const row = existing.rows[0];
  if (packet.action === 'begin') {
    if (
      packet.start_cursor < 1 ||
      packet.watermark < packet.start_cursor ||
      packet.expected_count > 1000000 ||
      packet.prune_resources.some(
        (resource) =>
          !incomingResources.has(resource) ||
          !connection.scopes.includes(resource) ||
          (historicalResources.has(resource) &&
            connection.invitation_public.include_history !== true)
      )
    )
      return conflict('invalid_snapshot_scope');
    if (row && !sameBegin(row, packet)) return conflict('snapshot_conflict');
    if (row?.status === 'failed') return conflict('snapshot_superseded');
    if (!row) {
      const head = await client.query<{ last_source_cursor: string }>(
        'SELECT last_source_cursor::text FROM sparkygym_source_heads WHERE user_id=$1 AND peer_ref=$2 FOR UPDATE',
        [connection.user_id, peer]
      );
      if (packet.start_cursor <= Number(head.rows[0]?.last_source_cursor ?? 0))
        return conflict('source_rewind');
      const overlap = await client.query(
        `SELECT 1 FROM sparkygym_snapshots WHERE user_id=$1 AND connection_id=$2 AND status='open' AND watermark >= $3 LIMIT 1
`,
        [connection.user_id, connection.id, packet.start_cursor]
      );
      if (overlap.rows.length) return conflict('snapshot_overlap');
      await client.query(
        `UPDATE sparkygym_snapshots SET status='failed',updated_at=now() WHERE user_id=$1 AND connection_id=$2 AND status='open'
`,
        [connection.user_id, connection.id]
      );
      await client.query(
        `INSERT INTO sparkygym_snapshots
        (user_id,connection_id,snapshot_id,peer_ref,start_cursor,watermark,expected_count,membership_sha256,prune_resources)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          connection.user_id,
          connection.id,
          packet.snapshot_id,
          peer,
          packet.start_cursor,
          packet.watermark,
          packet.expected_count,
          packet.membership_sha256,
          JSON.stringify(packet.prune_resources),
        ]
      );
    }
    return {
      version: 1 as const,
      snapshot_id: packet.snapshot_id,
      status:
        row?.status === 'complete'
          ? ('snapshot_complete' as const)
          : ('snapshot_started' as const),
    };
  }
  if (!row || row.status === 'failed') return conflict('snapshot_not_open');
  if (row.status === 'complete')
    return {
      version: 1 as const,
      snapshot_id: packet.snapshot_id,
      status: 'snapshot_complete' as const,
    };
  const membership = await incomingMembership(
    client,
    connection,
    packet.snapshot_id
  );
  if (
    membership.count !== row.expected_count ||
    membership.sha256 !== row.membership_sha256
  )
    return conflict('snapshot_membership_mismatch');
  // Remove only this source's absent records as of the declared watermark, never newer live edits.
  const absent = await client.query<{
    resource: SparkyGymResource;
    entity_id: string;
  }>(
    `SELECT e.resource,e.entity_id FROM sparkygym_entities e WHERE e.user_id=$1 AND e.peer_ref=$2
     AND e.resource=ANY($3::text[]) AND NOT e.tombstone AND e.last_source_cursor <= $4
     AND NOT EXISTS (SELECT 1 FROM sparkygym_snapshot_members m WHERE m.user_id=e.user_id AND m.connection_id=$5
       AND m.snapshot_id=$6 AND m.resource=e.resource AND m.entity_id=e.entity_id)
     ORDER BY e.resource,e.entity_id`,
    [
      connection.user_id,
      peer,
      row.prune_resources,
      row.watermark,
      connection.id,
      packet.snapshot_id,
    ]
  );
  for (const item of absent.rows) {
    const deletion = sparkyGymDomainEventSchema.parse({
      version: 1,
      event_id: randomUUID(),
      connection_id: connection.id,
      producer: 'opengym',
      resource: item.resource,
      entity_id: item.entity_id,
      revision: 1,
      source_cursor: Number(row.watermark),
      operation: 'delete',
      occurred_at: new Date().toISOString(),
      payload: null,
    });
    await applySparkyGymProjection(client, connection.user_id, peer, deletion);
    await client.query(
      `UPDATE sparkygym_entities SET tombstone=true,raw_payload=NULL,last_source_cursor=$5,updated_at=now()
      WHERE user_id=$1 AND peer_ref=$2 AND resource=$3 AND entity_id=$4 AND last_source_cursor <= $5`,
      [connection.user_id, peer, item.resource, item.entity_id, row.watermark]
    );
    await repository.appendNotification(
      connection.user_id,
      item.resource,
      { entity_id: item.entity_id, operation: 'delete' },
      client
    );
  }
  await repository.advanceSourceHead(
    connection.user_id,
    peer,
    Number(row.watermark),
    client
  );
  await client.query(
    `UPDATE sparkygym_snapshots SET status='complete',updated_at=now() WHERE user_id=$1 AND connection_id=$2 AND snapshot_id=$3
`,
    [connection.user_id, connection.id, packet.snapshot_id]
  );
  await repository.appendNotification(
    connection.user_id,
    'snapshot',
    { snapshot_id: packet.snapshot_id, status: 'complete' },
    client
  );
  return {
    version: 1 as const,
    snapshot_id: packet.snapshot_id,
    status: 'snapshot_complete' as const,
  };
}
