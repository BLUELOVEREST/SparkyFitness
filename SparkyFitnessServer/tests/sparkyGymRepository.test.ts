import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../db/poolManager.js', () => ({
  getClient: db.getClient,
  getSystemClient: db.getSystemClient,
}));
import * as repository from '../models/sparkyGymRepository.js';
import type { SparkyGymDomainEvent } from '@workspace/shared';

const event: SparkyGymDomainEvent = {
  version: 1,
  event_id: '00000000-0000-4000-8000-000000000001',
  connection_id: '00000000-0000-4000-8000-000000000002',
  producer: 'opengym',
  resource: 'exercise',
  entity_id: 'exercise-1',
  revision: 1,
  source_cursor: 1,
  operation: 'delete',
  occurred_at: '2026-10-29T00:00:00.000Z',
  payload: null,
};
const connection = {
  id: event.connection_id,
  user_id: '00000000-0000-4000-8000-000000000003',
  self_origin: 'https://sf.test',
  peer_origin: 'https://og.test',
  peer_user_id: 'peer',
  status: 'active',
  scopes: ['exercise'],
  allow_private: false,
  allow_http: false,
  credentials_encrypted: 'sealed',
  invitation_public: {},
  claim: null,
  expires_at: null,
  activated_at: null,
  replaces_connection_id: null,
  last_error: null,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('SparkyGym owner transactions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.getClient.mockResolvedValue(db);
    db.query.mockResolvedValue({ rows: [] });
  });
  it('sets explicit owner actor context and commits callback writes', async () => {
    await expect(
      repository.withOwnerTransaction('owner', async (client) => {
        await client.query('SELECT 42');
        return 42;
      })
    ).resolves.toBe(42);
    expect(db.getClient).toHaveBeenCalledWith('owner', 'owner');
    expect(db.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      'SELECT 42',
      'COMMIT',
    ]);
    expect(db.release).toHaveBeenCalledOnce();
    expect(db.getSystemClient).not.toHaveBeenCalled();
  });
  it('rolls back failed projections and releases the connection', async () => {
    await expect(
      repository.withOwnerTransaction('owner', async () => {
        throw new Error('projection failed');
      })
    ).rejects.toThrow('projection failed');
    expect(db.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      'ROLLBACK',
    ]);
    expect(db.release).toHaveBeenCalledOnce();
  });
  it('uses only the narrowly scoped app-role lookup for peer keys', async () => {
    await repository.lookupPeerConnectionByKeyId('invalid');
    expect(db.getSystemClient).not.toHaveBeenCalled();
    expect(db.getClient).not.toHaveBeenCalled();
  });
  it('replays exact hashes without rerunning the domain projection', async () => {
    const apply = vi.fn();
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM sparkygym_connections')
        ? [connection]
        : sql.includes('FROM sparkygym_inbox')
          ? [
              {
                body_sha256: 'a'.repeat(64),
                receipt: {
                  version: 1,
                  event_id: event.event_id,
                  status: 'applied',
                  revision: 1,
                },
              },
            ]
          : [],
    }));
    await expect(
      repository.receiveEvent(connection.user_id, event, 'a'.repeat(64), apply)
    ).resolves.toMatchObject({ status: 'duplicate' });
    expect(apply).not.toHaveBeenCalled();
    expect(
      db.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO sparkygym_source_heads')
      )
    ).toBe(false);
    expect(
      db.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO sparkygym_snapshot_members')
      )
    ).toBe(true);
  });
  it('rejects changed-byte replay and rolls back', async () => {
    const apply = vi.fn();
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM sparkygym_connections')
        ? [connection]
        : sql.includes('FROM sparkygym_inbox')
          ? [{ body_sha256: 'b'.repeat(64) }]
          : [],
    }));
    await expect(
      repository.receiveEvent(connection.user_id, event, 'a'.repeat(64), apply)
    ).rejects.toThrow('different bytes');
    expect(apply).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
  it('does not apply stale stream revisions', async () => {
    const apply = vi.fn();
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM sparkygym_connections')
        ? [connection]
        : sql.includes('FROM sparkygym_streams')
          ? [{ revision: '2' }]
          : [],
    }));
    await expect(
      repository.receiveEvent(connection.user_id, event, 'a'.repeat(64), apply)
    ).resolves.toMatchObject({ status: 'stale', revision: 2 });
    expect(apply).not.toHaveBeenCalled();
    expect(
      db.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO sparkygym_source_heads')
      )
    ).toBe(true);
    expect(
      db.query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO sparkygym_snapshot_members')
      )
    ).toBe(true);
  });
  it('refuses a non-active peer before projection', async () => {
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM sparkygym_connections')
        ? [{ ...connection, status: 'claimed' }]
        : [],
    }));
    const apply = vi.fn();
    await expect(
      repository.receiveEvent(connection.user_id, event, 'a'.repeat(64), apply)
    ).rejects.toThrow('not authorized');
    expect(apply).not.toHaveBeenCalled();
  });
  it('fails closed on a restored lower source cursor before stale-revision handling', async () => {
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM sparkygym_connections')
        ? [connection]
        : sql.includes('FROM sparkygym_source_heads')
          ? [{ last_source_cursor: '10' }]
          : sql.includes('FROM sparkygym_streams')
            ? [{ revision: '2' }]
            : [],
    }));
    const apply = vi.fn();
    await expect(
      repository.receiveEvent(connection.user_id, event, 'a'.repeat(64), apply)
    ).rejects.toThrow('source_rewind');
    expect(apply).not.toHaveBeenCalled();
  });
  it('rejects equal revision from a different event identity', async () => {
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM sparkygym_connections')
        ? [connection]
        : sql.includes('FROM sparkygym_streams')
          ? [{ revision: '1' }]
          : [],
    }));
    await expect(
      repository.receiveEvent(
        connection.user_id,
        event,
        'a'.repeat(64),
        vi.fn()
      )
    ).rejects.toThrow('event_conflict');
  });
  it('requires a snapshot for a compacted notification cursor', async () => {
    db.query.mockResolvedValue({
      rows: [{ first_cursor: '20', last_cursor: '30', has_cursor: false }],
    });
    await expect(
      repository.replayNotificationPage(connection.user_id, '10')
    ).resolves.toEqual({
      snapshot_required: true,
      notifications: [],
      last_cursor: '30',
    });
  });
  it('reports activation-in-flight as retryable rather than unauthorized', async () => {
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM sparkygym_connections')
        ? [{ ...connection, status: 'activating' }]
        : [],
    }));
    await expect(
      repository.receiveEvent(
        connection.user_id,
        event,
        'a'.repeat(64),
        vi.fn()
      )
    ).rejects.toMatchObject({ statusCode: 503, code: 'activation_pending' });
  });
});
