import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SparkyGymConnection } from '@workspace/shared';
import { getSystemClient, endPool } from '../db/poolManager.js';
import * as repository from '../models/sparkyGymRepository.js';
import { handleSnapshot } from '../integrations/opengym/snapshots.js';

const enabled = process.env.SPARKYGYM_RUN_PG_TESTS === '1';
if (enabled && !/^sparkygym[_-]/.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
  throw new Error('Fresh sparkygym_* fixture required');
const owner = randomUUID(),
  peer = 'https://gym.example.test\npeer';
const sha = createHash('sha256').digest('hex');
let connection: SparkyGymConnection;
describe.runIf(enabled)('PostgreSQL snapshot rewind protection', () => {
  beforeAll(async () => {
    const client = await getSystemClient();
    try {
      await client.query(
        'INSERT INTO public."user"(id,email,email_verified) VALUES($1,$2,true)',
        [owner, `${owner}@sparkygym.example.test`]
      );
    } finally {
      client.release();
    }
    connection = await repository.createConnection(owner, {
      id: randomUUID(),
      self_origin: 'https://sf.example.test',
      peer_origin: 'https://gym.example.test',
      peer_user_id: 'peer',
      status: 'active',
      scopes: ['workout'],
      credentials_encrypted: 'fixture-only',
      invitation_public: { include_history: true },
    });
    await repository.withOwnerTransaction(owner, async (tx) => {
      await tx.query(
        `INSERT INTO sparkygym_entities(user_id,peer_ref,resource,entity_id,last_source_cursor) VALUES($1,$2,'workout','retained',50)
`,
        [owner, peer]
      );
      await repository.advanceSourceHead(owner, peer, 100, tx);
    });
  });
  afterAll(async () => {
    const client = await getSystemClient();
    try {
      await client.query('DELETE FROM public."user" WHERE id=$1', [owner]);
    } finally {
      client.release();
      await endPool();
    }
  });
  it('rejects a new rewound empty snapshot before recording it or pruning retained data', async () => {
    const packet = {
      version: 1 as const,
      action: 'begin' as const,
      connection_id: connection.id,
      snapshot_id: randomUUID(),
      start_cursor: 60,
      watermark: 60,
      expected_count: 0,
      membership_sha256: sha,
      prune_resources: ['workout' as const],
    };
    await expect(
      repository.withOwnerTransaction(owner, (tx) =>
        handleSnapshot(tx, connection, packet)
      )
    ).rejects.toThrow('source_rewind');
    await repository.withOwnerTransaction(owner, async (tx) => {
      expect(
        (
          await tx.query(
            'SELECT tombstone FROM sparkygym_entities WHERE user_id=$1 AND peer_ref=$2',
            [owner, peer]
          )
        ).rows
      ).toEqual([{ tombstone: false }]);
      expect(
        (
          await tx.query(
            'SELECT count(*)::int AS n FROM sparkygym_snapshots WHERE user_id=$1',
            [owner]
          )
        ).rows[0]?.n
      ).toBe(0);
    });
  });
  it('keeps exact completed snapshot retries idempotent even after newer live events', async () => {
    const snapshotId = randomUUID();
    await repository.withOwnerTransaction(owner, (tx) =>
      tx.query(
        `INSERT INTO sparkygym_snapshots
      (user_id,connection_id,snapshot_id,peer_ref,start_cursor,watermark,expected_count,membership_sha256,prune_resources,status)
      VALUES($1,$2,$3,$4,40,60,0,$5,'[]','complete')`,
        [owner, connection.id, snapshotId, peer, sha]
      )
    );
    const result = await repository.withOwnerTransaction(owner, (tx) =>
      handleSnapshot(tx, connection, {
        version: 1,
        action: 'begin',
        connection_id: connection.id,
        snapshot_id: snapshotId,
        start_cursor: 40,
        watermark: 60,
        expected_count: 0,
        membership_sha256: sha,
        prune_resources: [],
      })
    );
    expect(result.status).toBe('snapshot_complete');
    await repository.withOwnerTransaction(owner, async (tx) => {
      expect(
        (
          await tx.query(
            'SELECT tombstone FROM sparkygym_entities WHERE user_id=$1 AND peer_ref=$2',
            [owner, peer]
          )
        ).rows[0]?.tombstone
      ).toBe(false);
    });
  });
});
