import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SparkyGymConnection, SparkyGymOutbox } from '@workspace/shared';
import * as repository from '../models/sparkyGymRepository.js';
import * as transport from '../integrations/opengym/transport.js';
import * as snapshots from '../integrations/opengym/snapshots.js';
import * as media from '../integrations/opengym/media.js';
import { SparkyGymService } from '../integrations/opengym/service.js';
import {
  derivePairKeys,
  openSecrets,
  sealSecrets,
  signControlRequest,
  signResponse,
  verifyResponse,
} from '../integrations/opengym/security.js';

const owner = randomUUID();
const id = randomUUID();
const secret = randomBytes(32).toString('base64url');
const offer = {
  version: 1 as const,
  connection_id: id,
  sf_owner_ref: owner,
  sf_origin: 'https://sf.example.com',
  peer_origin: 'https://og.example.com',
  sf_nonce: randomBytes(32).toString('base64url'),
  secret,
  expires_at: new Date(Date.now() + 600000).toISOString(),
  scopes: ['workout', 'body_measurement'] as ('workout' | 'body_measurement')[],
  include_history: false,
};
const claim = {
  version: 1 as const,
  connection_id: id,
  sf_owner_ref: owner,
  sf_origin: offer.sf_origin,
  og_origin: offer.peer_origin,
  sf_nonce: offer.sf_nonce,
  og_nonce: randomBytes(32).toString('base64url'),
  og_owner_ref: 'og-native-owner',
  scopes: offer.scopes,
  include_history: false,
};
let record: SparkyGymConnection;
const query = vi.fn<
  (
    sql: string,
    values?: unknown[]
  ) => Promise<{
    rows: repository.JsonObject[];
    rowCount: number;
  }>
>(async () => ({ rows: [], rowCount: 0 }));
const client = { query } as unknown as PoolClient;
const queued: repository.EnqueueControl[] = [];
function job(): SparkyGymOutbox {
  return {
    id: randomUUID(),
    user_id: owner,
    connection_id: id,
    source_cursor: 1,
    kind: 'control',
    path: '/api/integrations/v1/pair/accept',
    method: 'POST',
    body: JSON.stringify(claim),
    body_bytes: null,
    body_sha256: 'a'.repeat(64),
    request_id: id,
    resource: null,
    entity_id: null,
    revision: null,
    attempts: 0,
    next_due_at: new Date(),
    lease_token: randomUUID(),
    leased_until: new Date(Date.now() + 90000),
    status: 'pending',
    receipt: null,
    created_xid: '1',
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}
function context(raw: Buffer) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    connection: structuredClone(record),
    method: 'POST',
    path: '/api/integrations/v1/pair/claim',
    now: Number(timestamp),
    headers: {
      keyId: id,
      requestId: id,
      timestamp,
      signature: signControlRequest(
        'POST',
        '/api/integrations/v1/pair/claim',
        raw,
        id,
        timestamp,
        Buffer.from(secret, 'base64url'),
        id
      ),
    },
  };
}

beforeEach(() => {
  vi.stubEnv('SPARKY_FITNESS_API_ENCRYPTION_KEY', '11'.repeat(32));
  const { secret: _secret, ...publicOffer } = offer;
  record = {
    id,
    user_id: owner,
    self_origin: offer.sf_origin,
    peer_origin: offer.peer_origin,
    peer_user_id: null,
    status: 'pending',
    scopes: offer.scopes,
    allow_private: false,
    allow_http: false,
    credentials_encrypted: sealSecrets(id, {
      version: 1,
      sf_nonce: offer.sf_nonce,
      invitation_secret: secret,
    }),
    invitation_public: publicOffer,
    claim: null,
    expires_at: new Date(offer.expires_at),
    activated_at: null,
    replaces_connection_id: null,
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
  query.mockReset();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
  queued.splice(0);
  vi.spyOn(repository, 'withOwnerTransaction').mockImplementation(
    async <T>(_owner: string, fn: (tx: PoolClient) => Promise<T>) => fn(client)
  );
  vi.spyOn(repository, 'getConnection').mockImplementation(
    async (actor, requested) =>
      actor === owner && requested === id ? structuredClone(record) : null
  );
  vi.spyOn(repository, 'updateConnection').mockImplementation(
    async (_actor, _id, patch) => {
      record = { ...record, ...patch };
      return structuredClone(record);
    }
  );
  vi.spyOn(repository, 'enqueueControl').mockImplementation(
    async (_actor, input) => {
      queued.push(input);
      return job();
    }
  );
  vi.spyOn(repository, 'appendNotification').mockResolvedValue({
    id: '1',
    user_id: owner,
    resource: 'connection',
    payload: {},
    created_at: new Date(),
  });
  vi.spyOn(repository, 'acknowledgeOutbox').mockResolvedValue(true);
  vi.spyOn(repository, 'confirmActivation').mockImplementation(async () => {
    record = {
      ...record,
      activated_at: new Date(),
      status: record.status === 'activating' ? 'active' : record.status,
    };
    return structuredClone(record);
  });
  vi.spyOn(snapshots, 'enqueueBodySnapshot').mockResolvedValue(randomUUID());
});

describe('deleted-owner late media guard', () => {
  it('refetches the connection under the owner transaction instead of trusting the authenticated cached binding', async () => {
    const keys = derivePairKeys(offer, claim);
    record = {
      ...record,
      status: 'active',
      peer_user_id: claim.og_owner_ref,
      scopes: ['personal_media'],
      activated_at: new Date(),
      claim,
      credentials_encrypted: sealSecrets(id, {
        version: 1,
        sf_nonce: offer.sf_nonce,
        root_key: keys.root.toString('base64url'),
        incoming_key: keys.incoming.toString('base64url'),
        outgoing_key: keys.outgoing.toString('base64url'),
      }),
    };
    const cached = structuredClone(record);
    const raw = Buffer.from('late private media');
    const mediaPath = '/api/integrations/v1/media';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const persist = vi.spyOn(media, 'persistArchive');
    let locked = false;
    vi.mocked(repository.withOwnerTransaction).mockImplementation(
      async <T>(_owner: string, fn: (tx: PoolClient) => Promise<T>) => {
        locked = true;
        return fn(client);
      }
    );
    vi.mocked(repository.getConnection).mockImplementation(async () => {
      expect(locked).toBe(true);
      return null; // Account deletion cascaded the connection while this packet waited.
    });
    const reply = await new SparkyGymService().receive(
      {
        connection: cached,
        method: 'POST',
        path: mediaPath,
        now: Number(timestamp),
        headers: {
          keyId: `${id}_og`,
          requestId,
          timestamp,
          signature: signControlRequest(
            'POST',
            mediaPath,
            raw,
            `${id}_og`,
            timestamp,
            keys.incoming,
            requestId
          ),
        },
      },
      raw
    );
    expect(reply.status).toBe(404);
    expect(repository.getConnection).toHaveBeenCalledWith(owner, id, client);
    expect(persist).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});

describe('receipt-only revocation', () => {
  const revokePath = '/api/integrations/v1/revoke';
  const raw = Buffer.from(JSON.stringify({ version: 1, connection_id: id }));
  const keys = derivePairKeys(offer, claim);

  function packet(requestId = randomUUID(), bytes = raw) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    return {
      connection: structuredClone(record),
      method: 'POST',
      path: revokePath,
      now: Number(timestamp),
      headers: {
        keyId: `${id}_og`,
        requestId,
        timestamp,
        signature: signControlRequest(
          'POST',
          revokePath,
          bytes,
          `${id}_og`,
          timestamp,
          keys.incoming,
          requestId
        ),
      },
    };
  }

  beforeEach(() => {
    record = {
      ...record,
      status: 'active',
      peer_user_id: claim.og_owner_ref,
      activated_at: new Date(),
      claim,
      credentials_encrypted: sealSecrets(id, {
        version: 1,
        sf_nonce: offer.sf_nonce,
        invitation_secret: secret,
        root_key: keys.root.toString('base64url'),
        incoming_key: keys.incoming.toString('base64url'),
        outgoing_key: keys.outgoing.toString('base64url'),
      }),
    };
    const inbox = new Map<string, repository.JsonObject>();
    query.mockImplementation(async (sql, values = []) => {
      if (sql.startsWith('SELECT body_sha256,receipt')) {
        const prior = inbox.get(String(values[2]));
        return { rows: prior ? [prior] : [], rowCount: prior ? 1 : 0 };
      }
      if (sql.startsWith('INSERT INTO sparkygym_inbox'))
        inbox.set(String(values[2]), {
          body_sha256: String(values[3]),
          receipt: JSON.parse(String(values[4])) as repository.JsonObject,
        });
      return { rows: [], rowCount: 0 };
    });
    vi.spyOn(repository, 'lookupPeerConnectionByKeyId').mockImplementation(
      async () => structuredClone(record)
    );
  });

  function assertSigned(
    reply: Awaited<ReturnType<SparkyGymService['receive']>>,
    requestId: string
  ) {
    expect(
      verifyResponse(
        requestId,
        reply.status,
        reply.body,
        reply.headers['X-SparkyGym-Key-Id'],
        reply.headers['X-SparkyGym-Timestamp'],
        reply.headers['X-SparkyGym-Signature'],
        keys.outgoing
      )
    ).toBe(true);
  }

  it('seals only the first incoming receipt keys and re-signs a lost ACK retry', async () => {
    const service = new SparkyGymService();
    const first = packet();
    expect((await service.receive(first, raw)).status).toBe(200);
    const retained = openSecrets(id, record.credentials_encrypted);
    expect(retained).toEqual({
      version: 1,
      sf_nonce: offer.sf_nonce,
      revocation_receipt: {
        request_id: first.headers.requestId,
        body_sha256: createHash('sha256').update(raw).digest('hex'),
        incoming_key: keys.incoming.toString('base64url'),
        outgoing_key: keys.outgoing.toString('base64url'),
      },
    });
    const retry = packet(first.headers.requestId);
    const context = await service.preauthenticate(
      revokePath,
      'POST',
      retry.headers
    );
    const reply = await service.receive(context, raw);
    expect(reply.status).toBe(200);
    assertSigned(reply, retry.headers.requestId);
    expect(repository.appendNotification).toHaveBeenCalledTimes(1);
  });

  it('retains the latest locked revocation receipt through rotation and re-signs its lost ACK', async () => {
    const service = new SparkyGymService();
    const first = packet();
    await service.receive(first, raw);
    const retained = openSecrets(id, record.credentials_encrypted);
    const replacement: SparkyGymConnection = {
      ...record,
      id: randomUUID(),
      status: 'active',
      replaces_connection_id: id,
      invitation_public: { ...record.invitation_public, include_history: true },
    };
    const receiveQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql, values) => {
      if (
        sql.startsWith('SELECT id FROM sparkygym_outbox') ||
        sql.startsWith('SELECT snapshot_id FROM sparkygym_snapshots')
      )
        return { rows: [], rowCount: 1 };
      return receiveQuery(sql, values);
    });

    await service['finishRotation'](client, replacement);

    expect(openSecrets(id, record.credentials_encrypted)).toEqual(retained);
    expect(record.status).toBe('revoked');
    const retry = packet(first.headers.requestId);
    const context = await service.preauthenticate(
      revokePath,
      'POST',
      retry.headers
    );
    const reply = await service.receive(context, raw);
    expect(reply.status).toBe(200);
    assertSigned(reply, first.headers.requestId);
    await expect(
      service.preauthenticate(revokePath, 'POST', packet().headers)
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('wipes normal credentials when retiring a connection without a revocation receipt', async () => {
    const service = new SparkyGymService();
    const replacement: SparkyGymConnection = {
      ...record,
      id: randomUUID(),
      status: 'active',
      replaces_connection_id: id,
      invitation_public: { ...record.invitation_public, include_history: true },
    };
    query.mockResolvedValue({ rows: [], rowCount: 1 });

    await service['finishRotation'](client, replacement);

    expect(openSecrets(id, record.credentials_encrypted)).toEqual({
      version: 1,
      sf_nonce: offer.sf_nonce,
    });
    expect(record.status).toBe('revoked');
  });

  it('rejects fresh IDs, wrong paths and invalid MACs before body processing', async () => {
    const service = new SparkyGymService();
    const first = packet();
    await service.receive(first, raw);
    await expect(
      service.preauthenticate(revokePath, 'POST', packet().headers)
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      service.preauthenticate(revokePath, 'GET', first.headers)
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      service.preauthenticate(
        '/api/integrations/v1/snapshot',
        'POST',
        first.headers
      )
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      service.preauthenticate(revokePath, 'POST', {
        ...first.headers,
        signature: `v1=${'0'.repeat(64)}`,
      })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('checks receipt ID and exact hash against the latest locked connection', async () => {
    const service = new SparkyGymService();
    const first = packet();
    const staleFresh = packet();
    await service.receive(first, raw);
    await expect(service.receive(staleFresh, raw)).resolves.toMatchObject({
      status: 401,
    });
    const changed = Buffer.from(` ${raw.toString()}`);
    const reply = await service.receive(
      packet(first.headers.requestId, changed),
      changed
    );
    expect(reply.status).toBe(401);
    expect(repository.appendNotification).toHaveBeenCalledTimes(1);
  });

  it('satisfies concurrent local pending revocation only after an authenticated peer revoke', async () => {
    const service = new SparkyGymService();
    await service.action(owner, id, 'revoke');
    expect(
      openSecrets(id, record.credentials_encrypted).incoming_key
    ).toBeDefined();
    query.mockClear();
    const first = packet();
    await expect(
      service.receive(
        {
          ...first,
          headers: { ...first.headers, signature: `v1=${'0'.repeat(64)}` },
        },
        raw
      )
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(query).not.toHaveBeenCalled();
    expect((await service.receive(first, raw)).status).toBe(200);
    expect(
      query.mock.calls.some(
        ([sql, values]) =>
          sql.includes('UPDATE sparkygym_outbox') &&
          sql.includes("status='pending'") &&
          sql.includes("path='/api/integrations/v1/revoke'") &&
          String(values?.[2]).includes('peer_revocation_proof')
      )
    ).toBe(true);
    expect(
      openSecrets(id, record.credentials_encrypted).incoming_key
    ).toBeUndefined();
  });

  it('preserves a newly committed incoming receipt when an outbound ACK arrives late', async () => {
    const service = new SparkyGymService();
    await service.action(owner, id, 'revoke');
    const outgoing = {
      ...job(),
      path: revokePath,
      body: raw.toString(),
      request_id: randomUUID(),
    };
    const first = packet();
    vi.spyOn(transport, 'requestPeer').mockImplementation(async () => {
      await service.receive(first, raw);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = Buffer.from(
        JSON.stringify({
          connection: await service.publicStatus(client, record),
        })
      );
      return {
        status: 200,
        body,
        headers: {
          'x-sparkygym-key-id': `${id}_og`,
          'x-sparkygym-request-id': outgoing.request_id,
          'x-sparkygym-timestamp': timestamp,
          'x-sparkygym-signature': signResponse(
            outgoing.request_id,
            200,
            body,
            `${id}_og`,
            timestamp,
            keys.incoming
          ),
        },
      };
    });
    await service.deliver(outgoing, new AbortController().signal);
    const retained = openSecrets(id, record.credentials_encrypted);
    expect(retained.incoming_key).toBeUndefined();
    expect(retained.revocation_receipt?.request_id).toBe(
      first.headers.requestId
    );
    const reply = await service.receive(packet(first.headers.requestId), raw);
    expect(reply.status).toBe(200);
    assertSigned(reply, first.headers.requestId);
  });

  it('does not acknowledge an unsigned outbound HTTP success or discard pending keys', async () => {
    const service = new SparkyGymService();
    await service.action(owner, id, 'revoke');
    const encrypted = record.credentials_encrypted;
    vi.spyOn(repository, 'failOutbox').mockResolvedValue(true);
    vi.spyOn(transport, 'requestPeer').mockResolvedValue({
      status: 200,
      body: Buffer.from('{}'),
      headers: {},
    });
    await service.deliver(
      { ...job(), path: revokePath, body: raw.toString() },
      new AbortController().signal
    );
    expect(repository.acknowledgeOutbox).not.toHaveBeenCalled();
    expect(record.credentials_encrypted).toBe(encrypted);
    expect(repository.failOutbox).toHaveBeenCalledWith(
      owner,
      expect.any(String),
      'unverified_peer_response',
      expect.any(Date),
      undefined,
      expect.any(String)
    );
  });

  it('removes general keys after an authenticated outbound ACK without an incoming receipt', async () => {
    const service = new SparkyGymService();
    await service.action(owner, id, 'revoke');
    const outgoing = { ...job(), path: revokePath, body: raw.toString() };
    vi.spyOn(transport, 'requestPeer').mockImplementation(async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = Buffer.from(
        JSON.stringify({
          connection: await service.publicStatus(client, record),
        })
      );
      return {
        status: 200,
        body,
        headers: {
          'x-sparkygym-key-id': `${id}_og`,
          'x-sparkygym-request-id': outgoing.request_id,
          'x-sparkygym-timestamp': timestamp,
          'x-sparkygym-signature': signResponse(
            outgoing.request_id,
            200,
            body,
            `${id}_og`,
            timestamp,
            keys.incoming
          ),
        },
      };
    });
    await service.deliver(outgoing, new AbortController().signal);
    expect(repository.acknowledgeOutbox).toHaveBeenCalledTimes(1);
    expect(openSecrets(id, record.credentials_encrypted)).toEqual({
      version: 1,
      sf_nonce: offer.sf_nonce,
    });
    await expect(
      service.preauthenticate(revokePath, 'POST', packet().headers)
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('bilateral owner activation', () => {
  it('claims once without activation, returns a derived-key signed receipt and permits exact JSONB retries', async () => {
    const service = new SparkyGymService();
    const raw = Buffer.from(JSON.stringify(claim));
    const response = await service.receive(context(raw), raw);
    expect(response.status).toBe(200);
    expect(record.status).toBe('claimed');
    expect(queued).toHaveLength(0);
    expect(record.peer_user_id).toBe(claim.og_owner_ref);
    const keys = derivePairKeys(offer, claim);
    expect(
      verifyResponse(
        id,
        response.status,
        response.body,
        response.headers['X-SparkyGym-Key-Id'],
        response.headers['X-SparkyGym-Timestamp'],
        response.headers['X-SparkyGym-Signature'],
        keys.outgoing
      )
    ).toBe(true);
    record.claim = Object.fromEntries(Object.entries(claim).reverse());
    record.invitation_public.peer_capabilities = { version: 1 };
    expect((await service.receive(context(raw), raw)).status).toBe(200);
    const changed = Buffer.from(
      JSON.stringify({ ...claim, og_owner_ref: 'another-account' })
    );
    expect((await service.receive(context(changed), changed)).status).toBe(409);
    expect(record.peer_user_id).toBe(claim.og_owner_ref);
  });

  it('queues approval transactionally and never binds a delegated owner', async () => {
    const service = new SparkyGymService();
    const raw = Buffer.from(JSON.stringify(claim));
    await service.receive(context(raw), raw);
    await expect(
      service.action(randomUUID(), id, 'approve')
    ).rejects.toMatchObject({ statusCode: 404 });
    await service.action(owner, id, 'approve');
    expect(record.status).toBe('activating');
    expect(record.activated_at).toBeNull();
    expect(queued).toEqual([
      expect.objectContaining({
        connection_id: id,
        request_id: id,
        path: '/api/integrations/v1/pair/accept',
      }),
    ]);
    expect(snapshots.enqueueBodySnapshot).not.toHaveBeenCalled();
  });

  it('a valid acceptance receipt cannot undo a pause in flight; resume queues the initial state exactly once', async () => {
    const service = new SparkyGymService();
    const raw = Buffer.from(JSON.stringify(claim));
    await service.receive(context(raw), raw);
    await service.action(owner, id, 'approve');
    const secrets = openSecrets(id, record.credentials_encrypted);
    vi.spyOn(transport, 'requestPeer').mockImplementation(async () => {
      record.status = 'paused';
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = Buffer.from(
        JSON.stringify({
          connection: {
            connection_id: id,
            status: 'active',
            peer_origin: offer.sf_origin,
            peer_owner_ref: owner,
            scopes: offer.scopes,
            include_history: false,
            affected_record_counts: {},
            capabilities: null,
            delivery: {
              pending: 0,
              failed: 0,
              pending_media: 0,
              last_success_at: null,
              last_error_code: null,
            },
          },
        })
      );
      return {
        status: 200,
        body,
        headers: {
          'x-sparkygym-key-id': `${id}_og`,
          'x-sparkygym-request-id': id,
          'x-sparkygym-timestamp': timestamp,
          'x-sparkygym-signature': signResponse(
            id,
            200,
            body,
            `${id}_og`,
            timestamp,
            Buffer.from(secrets.incoming_key!, 'base64url')
          ),
        },
      };
    });
    await service.deliver(job(), new AbortController().signal);
    expect(record.status).toBe('paused');
    expect(record.activated_at).toBeInstanceOf(Date);
    expect(record.last_error).toBe('initial_snapshot_pending');
    expect(snapshots.enqueueBodySnapshot).not.toHaveBeenCalled();
    await service.action(owner, id, 'resume');
    expect(record.status).toBe('active');
    expect(snapshots.enqueueBodySnapshot).toHaveBeenCalledTimes(1);
  });
});
