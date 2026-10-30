/** Main acceptance runner boots the isolated fixture before opting into these tests. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Notification, PoolClient } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { sparkyGymArchiveCleanupJobSchema } from '@workspace/shared';
import { endPool, getClient, getSystemClient } from '../db/poolManager.js';
import * as repository from '../models/sparkyGymRepository.js';
import { processArchiveCleanup } from '../models/sparkyGymArchiveCleanupRepository.js';

const enabled = process.env.SPARKYGYM_RUN_PG_TESTS === '1';
if (enabled && !/^sparkygym[_-]/.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
  throw new Error(
    'Archive cleanup PG tests require a fresh sparkygym_* database'
  );
const owners: string[] = [];
const directories: string[] = [];
async function createOwner(client: PoolClient): Promise<string> {
  const owner = randomUUID();
  owners.push(owner);
  await client.query(
    'INSERT INTO public."user"(id,email,email_verified) VALUES($1,$2,true)',
    [owner, `${owner}@archive.example.test`]
  );
  return owner;
}
async function cleanupJob(client: PoolClient, owner: string) {
  const result = await client.query(
    'SELECT * FROM public.sparkygym_archive_cleanup_jobs WHERE owner_id=$1',
    [owner]
  );
  return result.rows[0]
    ? sparkyGymArchiveCleanupJobSchema.parse(result.rows[0])
    : null;
}

describe.runIf(enabled)('deleted-account archives on PostgreSQL', () => {
  afterAll(async () => {
    vi.unstubAllEnvs();
    const client = await getSystemClient();
    try {
      await client.query('DELETE FROM public."user" WHERE id=ANY($1::uuid[])', [
        owners,
      ]);
      await client.query(
        'DELETE FROM public.sparkygym_archive_cleanup_jobs WHERE owner_id=ANY($1::uuid[])',
        [owners]
      );
    } finally {
      client.release();
    }
    for (const directory of directories)
      fs.rmSync(directory, { recursive: true, force: true });
    await endPool();
  });

  it('rolls back enqueue and NOTIFY with deletion; committed jobs survive the media FK cascade', async () => {
    const client = await getSystemClient();
    const observer = await getSystemClient();
    const notifications: Notification[] = [];
    const notified = (event: Notification) => notifications.push(event);
    observer.on('notification', notified);
    try {
      await observer.query('LISTEN sparkygym_archive_cleanup');
      const owner = await createOwner(client);
      await client.query(
        'INSERT INTO public.sparkygym_media(user_id,sha256,bytes,mime) VALUES($1,$2,1,$3)',
        [owner, 'a'.repeat(64), 'image/png']
      );
      await client.query('BEGIN');
      await client.query('DELETE FROM public."user" WHERE id=$1', [owner]);
      expect(await cleanupJob(client, owner)).not.toBeNull();
      expect(await cleanupJob(observer, owner)).toBeNull();
      await client.query('ROLLBACK');
      await observer.query('SELECT pg_sleep(0.05)');
      expect(notifications).toEqual([]);
      expect(await cleanupJob(observer, owner)).toBeNull();
      await client.query('DELETE FROM public."user" WHERE id=$1', [owner]);
      await observer.query('SELECT pg_sleep(0.05)');
      expect(
        notifications.some(
          (event) => event.channel === 'sparkygym_archive_cleanup'
        )
      ).toBe(true);
      expect(await cleanupJob(observer, owner)).not.toBeNull();
      expect(
        (
          await observer.query(
            'SELECT id FROM public.sparkygym_media WHERE user_id=$1',
            [owner]
          )
        ).rows
      ).toEqual([]);
    } finally {
      await client.query('ROLLBACK');
      observer.removeListener('notification', notified);
      await observer.query('UNLISTEN *');
      observer.release();
      client.release();
    }
  });

  it('has no user FK and denies owner, delegate, stranger and request-admin contexts', async () => {
    const system = await getSystemClient();
    try {
      const owner = await createOwner(system);
      const delegate = await createOwner(system);
      const stranger = await createOwner(system);
      const admin = await createOwner(system);
      await system.query(
        'UPDATE public."user" SET role=\'admin\' WHERE id=$1',
        [admin]
      );
      await system.query(
        `INSERT INTO family_access(owner_user_id,family_user_id,family_email,access_permissions,is_active,status)
        VALUES($1,$2,$3,'{"can_manage_diary":true,"can_manage_checkin":true,"can_view_reports":true}',true,'active')`,
        [owner, delegate, `${delegate}@archive.example.test`]
      );
      await system.query(
        'INSERT INTO public.sparkygym_archive_cleanup_jobs(owner_id) VALUES($1)',
        [owner]
      );
      const foreignKeys = await system.query(
        'SELECT conname FROM pg_constraint WHERE conrelid=$1::regclass AND contype=$2',
        ['public.sparkygym_archive_cleanup_jobs', 'f']
      );
      expect(foreignKeys.rows).toEqual([]);
      for (const [target, actor] of [
        [owner, owner],
        [owner, delegate],
        [stranger, stranger],
        [admin, admin],
      ]) {
        const app = await getClient(target, actor);
        try {
          expect(
            (
              await app.query(
                'SELECT * FROM public.sparkygym_archive_cleanup_jobs'
              )
            ).rows
          ).toEqual([]);
          await expect(
            app.query(
              'INSERT INTO public.sparkygym_archive_cleanup_jobs(owner_id) VALUES($1)',
              [randomUUID()]
            )
          ).rejects.toMatchObject({ code: '42501' });
          expect(
            (
              await app.query(
                'UPDATE public.sparkygym_archive_cleanup_jobs SET attempts=1 WHERE owner_id=$1',
                [owner]
              )
            ).rowCount
          ).toBe(0);
          expect(
            (
              await app.query(
                'DELETE FROM public.sparkygym_archive_cleanup_jobs WHERE owner_id=$1',
                [owner]
              )
            ).rowCount
          ).toBe(0);
          await expect(
            app.query(
              'SELECT sparkygym_private.enqueue_account_archive_cleanup()'
            )
          ).rejects.toMatchObject({ code: '42501' });
        } finally {
          app.release();
        }
      }
    } finally {
      system.release();
    }
  });

  it('does not hold the job row while waiting for the owner lock on a restored live account', async () => {
    const system = await getSystemClient();
    const importer = await getSystemClient();
    let pending: Promise<void> | undefined;
    try {
      const owner = await createOwner(system);
      await system.query(
        'INSERT INTO public.sparkygym_archive_cleanup_jobs(owner_id) VALUES($1)',
        [owner]
      );
      const queued = (await cleanupJob(system, owner))!;
      const uploads = fs.mkdtempSync(
        path.join(os.tmpdir(), 'sf-archive-order-pg-')
      );
      directories.push(uploads);
      vi.stubEnv('SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY', uploads);
      await importer.query('BEGIN');
      await repository.lockOwnerSource(owner, importer);
      pending = processArchiveCleanup(queued, new AbortController().signal);
      await system.query('SELECT pg_sleep(0.05)');
      // If cleanup had locked the job first, this trigger upsert would wait on
      // that row while cleanup waited on the importer. Bound the failure time.
      await system.query('SET statement_timeout=2000');
      await system.query('DELETE FROM public."user" WHERE id=$1', [owner]);
      expect(await cleanupJob(system, owner)).not.toBeNull();
      await importer.query('COMMIT');
      await pending;
      // DELETE refreshed the due time after cleanup's BEGIN. The first attempt
      // must use post-lock wall time, not that transaction's frozen now().
      expect(await cleanupJob(system, owner)).toBeNull();
    } finally {
      await importer.query('ROLLBACK');
      await pending;
      await system.query('RESET statement_timeout');
      importer.release();
      system.release();
      vi.unstubAllEnvs();
    }
  });

  it('waits for an in-flight import lock, then cleans up, and a late importer cannot refetch a deleted connection', async () => {
    const system = await getSystemClient();
    const writer = await getSystemClient();
    let pendingCleanup: Promise<void> | undefined;
    try {
      const owner = await createOwner(system);
      const connectionId = randomUUID();
      await repository.createConnection(owner, {
        id: connectionId,
        self_origin: 'https://sf.example.test',
        peer_origin: 'https://og.example.test',
        peer_user_id: 'archive-peer',
        status: 'active',
        scopes: ['personal_media'],
        credentials_encrypted: 'fixture',
        invitation_public: {},
      });
      const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-archive-pg-'));
      directories.push(uploads);
      vi.stubEnv('SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY', uploads);
      const directory = path.join(uploads, 'sparkygym', owner);
      fs.mkdirSync(directory, { recursive: true });
      await system.query(
        'INSERT INTO public.check_in_measurements(user_id,entry_date,weight) VALUES($1,$2,70)',
        [owner, '2026-10-30']
      );
      await writer.query('BEGIN');
      await repository.lockOwnerSource(owner, writer);
      // The import has its owner lock, but has not refetched the connection yet.
      // DELETE must not invert that order by taking this lock in its row trigger.
      // BODY rows cascade too: capture_body must return before its advisory lock
      // when the account is gone, or DELETE and this importer deadlock.
      await system.query('SET statement_timeout=2000');
      await system.query('DELETE FROM public."user" WHERE id=$1', [owner]);
      await system.query('RESET statement_timeout');
      const queued = (await cleanupJob(system, owner))!;
      let finished = false;
      pendingCleanup = processArchiveCleanup(
        queued,
        new AbortController().signal
      ).then(() => {
        finished = true;
      });
      await system.query('SELECT pg_sleep(0.05)');
      expect(finished).toBe(false);
      expect(
        await repository.getConnection(owner, connectionId, writer)
      ).toBeNull();
      fs.writeFileSync(
        path.join(directory, '.upload-inflight'),
        'interrupted import'
      );
      await writer.query('COMMIT');
      await pendingCleanup;
      expect(fs.existsSync(directory)).toBe(false);
      expect(await cleanupJob(system, owner)).toBeNull();
      await repository.withOwnerTransaction(owner, async (client) => {
        expect(
          await repository.getConnection(owner, connectionId, client)
        ).toBeNull();
      });
      expect(fs.existsSync(directory)).toBe(false);
    } finally {
      await writer.query('ROLLBACK');
      await pendingCleanup;
      writer.release();
      await system.query('RESET statement_timeout');
      system.release();
      vi.unstubAllEnvs();
    }
  });
});
