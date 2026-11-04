import type { PoolClient } from 'pg';
import { beforeEach, expect, it, vi } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../security/encryption.js', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  ENCRYPTION_KEY: 'test',
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const query =
  vi.fn<
    (
      sql: string,
      params: string[]
    ) => Promise<{ rows: Record<string, unknown>[] }>
  >();
const release = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({
    query,
    release,
  } as unknown as PoolClient);
});

it('reads only credential-free metadata through the actor-scoped client', async () => {
  const row = {
    user_id: 'actor',
    is_public: false,
    service_type: 'openai_compatible',
    custom_url: 'https://example.com/v1',
  };
  query.mockResolvedValue({ rows: [row] });
  expect(
    await chatRepository.getAiServiceDiscoverySetting('config', 'actor')
  ).toEqual(row);
  expect(getClient).toHaveBeenCalledWith('actor');
  expect(query).toHaveBeenCalledWith(
    'SELECT user_id, is_public, service_type, custom_url FROM ai_service_settings WHERE id = $1 AND (user_id = $2 OR is_public = TRUE)',
    ['config', 'actor']
  );
  expect(release).toHaveBeenCalledTimes(1);
});

it('returns null when no accessible setting exists', async () => {
  query.mockResolvedValue({ rows: [] });
  expect(
    await chatRepository.getAiServiceDiscoverySetting('config', 'actor')
  ).toBeNull();
  expect(release).toHaveBeenCalledTimes(1);
});

it('releases the client if a metadata query fails', async () => {
  query.mockRejectedValue(new Error('database failure'));
  await expect(
    chatRepository.getAiServiceDiscoverySetting('config', 'actor')
  ).rejects.toThrow('database failure');
  expect(release).toHaveBeenCalledTimes(1);
});
