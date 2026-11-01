import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BODY_CIRCUMFERENCE_PARTS } from '@workspace/shared';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query =
  vi.fn<
    (
      sql: string,
      values?: unknown[]
    ) => Promise<{ rows: Record<string, unknown>[] }>
  >();
const release = vi.fn();

describe('native circumference partial-day persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [{ id: 'day-1' }] });
    vi.mocked(getClient).mockResolvedValue({
      query,
      release,
    } as unknown as PoolClient);
  });

  it.each(BODY_CIRCUMFERENCE_PARTS)(
    'updates only $key while preserving all other day fields',
    async ({ key }) => {
      await measurementRepository.upsertCheckInMeasurements(
        'owner',
        'actor',
        '2026-10-31',
        { [key]: 25.4 }
      );
      expect(getClient).toHaveBeenCalledWith('actor');
      const [sql, values] = query.mock.calls[1];
      expect(sql).toContain(`SET ${key} = $1, updated_at`);
      expect(sql).not.toContain('SET weight');
      expect(values).toEqual([25.4, 'actor', 'day-1']);
      expect(release).toHaveBeenCalledOnce();
    }
  );

  it('clears the requested built-in column with null, without clearing unrelated values', async () => {
    await measurementRepository.upsertCheckInMeasurements(
      'owner',
      'actor',
      '2026-10-31',
      { left_ankle: null }
    );
    expect(query.mock.calls[1][0]).toContain('SET left_ankle = $1, updated_at');
    expect(query.mock.calls[1][1]).toEqual([null, 'actor', 'day-1']);
  });
});
