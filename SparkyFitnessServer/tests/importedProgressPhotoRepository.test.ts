import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock('../db/poolManager.js', () => ({
  getClient: db.getClient,
  getSystemClient: vi.fn(),
}));
import { listImportedProgressPhotos } from '../models/importedProgressPhotoRepository.js';

const id = '22222222-2222-4222-8222-222222222222';
describe('imported progress photo selection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.getClient.mockResolvedValue(db);
    db.query.mockResolvedValue({ rows: [] });
  });
  it('queries existing live progress archives in owner RLS context without native writes', async () => {
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT DISTINCT')
        ? [{ id, entry_date: '2026-10-31', source: 'opengym' }]
        : [],
    }));
    expect(await listImportedProgressPhotos('owner')).toEqual([
      { id, entry_date: '2026-10-31', source: 'opengym' },
    ]);
    expect(db.getClient).toHaveBeenCalledWith('owner', 'owner');
    const selection = db.query.mock.calls.find(([sql]) =>
      String(sql).includes('SELECT DISTINCT')
    );
    expect(selection?.[1]).toEqual(['owner']);
    for (const guard of [
      'e.user_id = m.user_id',
      "e.resource = 'personal_media'",
      'NOT e.tombstone',
      "e.raw_payload->>'kind' = 'progress'",
      "e.raw_payload->>'workout_id' IS NULL",
      "m.status = 'ready'",
      'm.private_path IS NOT NULL',
    ]) {
      expect(selection?.[0]).toContain(guard);
    }
    expect(
      db.query.mock.calls.some(([sql]) =>
        /INSERT|UPDATE|DELETE/.test(String(sql))
      )
    ).toBe(false);
    expect(db.release).toHaveBeenCalledOnce();
  });
  it('drops malformed dates rather than creating phantom check-in days', async () => {
    db.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT DISTINCT')
        ? [{ id, entry_date: '2026-02-31', source: 'opengym' }]
        : [],
    }));
    expect(await listImportedProgressPhotos('owner')).toEqual([]);
  });
});
