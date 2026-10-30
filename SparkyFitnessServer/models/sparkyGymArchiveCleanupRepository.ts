import type { PoolClient } from 'pg';
import {
  sparkyGymArchiveCleanupJobSchema,
  type SparkyGymArchiveCleanupJob,
} from '@workspace/shared';
import { getRawOwnerPool } from '../db/poolManager.js';
import { lockOwnerSource } from './sparkyGymRepository.js';
import {
  privateArchiveRoot,
  removeOwnerArchive,
} from '../integrations/opengym/media.js';
import { retryDeadline } from '../integrations/opengym/delivery.js';

// Background only: deleted owners cannot have a request-scoped RLS context.
export async function listDueArchiveCleanup(): Promise<SparkyGymArchiveCleanupJob | null> {
  const client: PoolClient = await getRawOwnerPool().connect();
  try {
    const result =
      await client.query(`SELECT * FROM public.sparkygym_archive_cleanup_jobs
      WHERE next_due_at<=now() ORDER BY next_due_at,owner_id LIMIT 1`);
    return result.rows[0]
      ? sparkyGymArchiveCleanupJobSchema.parse(result.rows[0])
      : null;
  } finally {
    client.release();
  }
}

export async function nextArchiveCleanupDeadline(): Promise<number | null> {
  const client: PoolClient = await getRawOwnerPool().connect();
  try {
    const result = await client.query<{ next_due_at: Date | null }>(
      'SELECT min(next_due_at) AS next_due_at FROM public.sparkygym_archive_cleanup_jobs'
    );
    return result.rows[0]?.next_due_at?.getTime() ?? null;
  } finally {
    client.release();
  }
}

export async function processArchiveCleanup(
  job: SparkyGymArchiveCleanupJob,
  signal: AbortSignal
): Promise<void> {
  const owner = sparkyGymArchiveCleanupJobSchema.parse(job).owner_id;
  const client: PoolClient = await getRawOwnerPool().connect();
  try {
    await client.query('BEGIN');
    // Same lock as receiveMedia's withOwnerTransaction, before any row locks.
    // The DELETE trigger intentionally never takes it (user tuple lock order).
    await lockOwnerSource(owner, client);
    // DELETE may refresh next_due_at while we wait. PostgreSQL now() is fixed
    // at BEGIN, so check the actual post-lock clock rather than skipping a due
    // refreshed job until a redundant second worker transaction.
    const result = await client.query(
      `SELECT * FROM public.sparkygym_archive_cleanup_jobs
      WHERE owner_id=$1 AND next_due_at<=clock_timestamp() FOR UPDATE`,
      [owner]
    );
    if (result.rows[0] && !signal.aborted) {
      const current = sparkyGymArchiveCleanupJobSchema.parse(result.rows[0]);
      const existing = await client.query(
        'SELECT id FROM public."user" WHERE id=$1',
        [owner]
      );
      let failure: SparkyGymArchiveCleanupJob['last_error'] = existing.rows
        .length
        ? 'owner_still_exists'
        : null;
      if (!failure) {
        try {
          removeOwnerArchive(privateArchiveRoot(), owner);
        } catch {
          failure = 'archive_cleanup_failed';
        }
      }
      if (failure) {
        await client.query(
          `UPDATE public.sparkygym_archive_cleanup_jobs
          SET attempts=least(attempts+1,20),next_due_at=$2,last_error=$3,updated_at=now() WHERE owner_id=$1`,
          [
            owner,
            new Date(retryDeadline(current.attempts, Date.now())),
            failure,
          ]
        );
      } else {
        await client.query(
          'DELETE FROM public.sparkygym_archive_cleanup_jobs WHERE owner_id=$1',
          [owner]
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
