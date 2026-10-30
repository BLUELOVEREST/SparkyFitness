import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeOwnerArchive } from '../integrations/opengym/media.js';
import {
  processArchiveCleanup,
  listDueArchiveCleanup,
  nextArchiveCleanupDeadline,
} from '../models/sparkyGymArchiveCleanupRepository.js';

const state = vi.hoisted(() => ({
  query:
    vi.fn<
      (
        sql: string,
        values?: unknown[]
      ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }>
    >(),
  release: vi.fn(),
}));
vi.mock('../db/poolManager.js', () => ({
  getRawOwnerPool: () => ({ connect: async () => state }),
}));

const directories: string[] = [];
const owner = randomUUID();
const job = {
  owner_id: owner,
  attempts: 0,
  next_due_at: new Date(0),
  last_error: null,
  created_at: new Date(0),
  updated_at: new Date(0),
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  state.query.mockReset();
  state.release.mockReset();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-archive-cleanup-'));
  directories.push(uploads);
  vi.stubEnv('SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY', uploads);
  const root = path.join(uploads, 'sparkygym');
  fs.mkdirSync(path.join(root, owner), { recursive: true });
  fs.writeFileSync(path.join(root, owner, '.upload-interrupted'), 'private');
  return root;
}
function database(ownerExists = false) {
  state.query.mockImplementation(async (sql) => {
    if (sql.includes('FOR UPDATE')) return { rows: [job], rowCount: 1 };
    if (sql.includes('FROM public."user"'))
      return {
        rows: ownerExists ? [{ id: owner }] : [],
        rowCount: ownerExists ? 1 : 0,
      };
    return { rows: [], rowCount: 0 };
  });
}

describe('deleted-account private archives', () => {
  it('removes only the validated owner directory, including temporary files', () => {
    const root = fixture();
    const retained = path.join(root, randomUUID());
    fs.mkdirSync(retained);
    fs.writeFileSync(path.join(retained, 'private'), 'retain');
    expect(() => removeOwnerArchive(root, '../outside')).toThrow();
    removeOwnerArchive(root, owner);
    expect(fs.existsSync(path.join(root, owner))).toBe(false);
    expect(fs.existsSync(path.join(retained, 'private'))).toBe(true);
  });

  it('repeats parent fsync after an unlink succeeded but its durability barrier failed', () => {
    const root = fixture();
    const sync = vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => {
      throw new Error('sync failed');
    });
    expect(() => removeOwnerArchive(root, owner)).toThrow('sync failed');
    expect(fs.existsSync(path.join(root, owner))).toBe(false);
    removeOwnerArchive(root, owner);
    expect(sync.mock.calls.length).toBeGreaterThan(1);
  });

  it('unlinks an owner-directory symlink without traversing another owner archive', () => {
    const root = fixture();
    const retained = path.join(root, randomUUID());
    fs.mkdirSync(retained);
    fs.writeFileSync(path.join(retained, 'private'), 'retain');
    fs.rmSync(path.join(root, owner), { recursive: true });
    fs.symlinkSync(retained, path.join(root, owner));
    removeOwnerArchive(root, owner);
    expect(fs.existsSync(path.join(root, owner))).toBe(false);
    expect(fs.readFileSync(path.join(retained, 'private'), 'utf8')).toBe(
      'retain'
    );
  });

  it('retains both archive and job after an unlink failure', async () => {
    const root = fixture();
    database();
    vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('unlink denied');
    });
    await processArchiveCleanup(job, new AbortController().signal);
    expect(fs.existsSync(path.join(root, owner, '.upload-interrupted'))).toBe(
      true
    );
    expect(
      state.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM'))
    ).toBe(false);
    expect(
      state.query.mock.calls.some(
        ([sql, values]) =>
          sql.startsWith('UPDATE public.sparkygym_archive_cleanup_jobs') &&
          values?.[2] === 'archive_cleanup_failed'
      )
    ).toBe(true);
  });

  it('syncs an existing ancestor even when the archive root is already absent', () => {
    const root = fixture();
    fs.rmSync(root, { recursive: true });
    const sync = vi.spyOn(fs, 'fsyncSync');
    removeOwnerArchive(root, owner);
    expect(sync).toHaveBeenCalled();
  });

  it('locks before rechecking owner absence and acknowledges only after durable removal', async () => {
    const root = fixture();
    database();
    await processArchiveCleanup(job, new AbortController().signal);
    const sql = state.query.mock.calls.map(([query]) => query);
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toContain('pg_advisory_xact_lock');
    expect(sql[2]).toContain('FOR UPDATE');
    expect(sql[2]).toContain('next_due_at<=clock_timestamp()');
    expect(state.query.mock.calls[1]?.[1]).toEqual([
      `sparkygym-owner:${owner}`,
    ]);
    expect(
      sql.findIndex((query) => query.includes('FROM public."user"'))
    ).toBeGreaterThan(1);
    expect(
      sql.some((query) =>
        query.startsWith('DELETE FROM public.sparkygym_archive_cleanup_jobs')
      )
    ).toBe(true);
    expect(sql.at(-1)).toBe('COMMIT');
    expect(fs.existsSync(path.join(root, owner))).toBe(false);
  });

  it('retains a failed job with bounded persisted backoff, then retries ENOENT safely', async () => {
    const root = fixture();
    database();
    const sync = vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => {
      throw new Error('private filesystem error');
    });
    await processArchiveCleanup(job, new AbortController().signal);
    const update = state.query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE public.sparkygym_archive_cleanup_jobs')
    );
    expect(update?.[1]?.[2]).toBe('archive_cleanup_failed');
    const deadline = update?.[1]?.[1];
    expect(deadline).toBeInstanceOf(Date);
    expect((deadline as Date).getTime() - Date.now()).toBeLessThanOrEqual(
      900000
    );
    expect(
      state.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM'))
    ).toBe(false);
    sync.mockRestore();
    state.query.mockClear();
    await processArchiveCleanup(job, new AbortController().signal);
    expect(
      state.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM'))
    ).toBe(true);
    expect(fs.existsSync(path.join(root, owner))).toBe(false);
  });

  it('never unlinks while the owner still exists and keeps the job retryable', async () => {
    const root = fixture();
    database(true);
    await processArchiveCleanup(job, new AbortController().signal);
    expect(fs.existsSync(path.join(root, owner, '.upload-interrupted'))).toBe(
      true
    );
    expect(
      state.query.mock.calls.some(
        ([sql, values]) =>
          sql.startsWith('UPDATE public.sparkygym_archive_cleanup_jobs') &&
          values?.[2] === 'owner_still_exists'
      )
    ).toBe(true);
  });

  it('rolls back database errors without acknowledging the job', async () => {
    fixture();
    database();
    const implementation = state.query.getMockImplementation()!;
    state.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith('DELETE FROM')) throw new Error('commit interrupted');
      return implementation(sql, values);
    });
    await expect(
      processArchiveCleanup(job, new AbortController().signal)
    ).rejects.toThrow('commit interrupted');
    expect(state.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(state.release).toHaveBeenCalled();
  });

  it('reads durable due jobs and their next one-shot deadline using the background pool', async () => {
    state.query.mockResolvedValueOnce({ rows: [job], rowCount: 1 });
    expect(await listDueArchiveCleanup()).toEqual(job);
    expect(state.query.mock.calls[0]?.[0]).not.toContain('FOR UPDATE');
    state.query.mockResolvedValueOnce({
      rows: [{ next_due_at: null }],
      rowCount: 1,
    });
    expect(await nextArchiveCleanupDeadline()).toBeNull();
  });
});
