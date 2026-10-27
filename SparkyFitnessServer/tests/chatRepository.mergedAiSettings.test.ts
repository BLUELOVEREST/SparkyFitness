import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiServiceSettings } from '@workspace/shared';
import { getClient, getSystemClient } from '../db/poolManager.js';
import chatRepository from '../models/chatRepository.js';

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

describe('merged AI settings persistence', () => {
  const query = vi.fn();
  const release = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    const client = { query, release } as unknown as Awaited<
      ReturnType<typeof getClient>
    >;
    vi.mocked(getClient).mockResolvedValue(client);
    vi.mocked(getSystemClient).mockResolvedValue(client);
    query.mockResolvedValue({ rows: [{ id: 'service' }] });
  });

  it.each([false, true])(
    'binds Eric and upstream fields for global=%s',
    async (global) => {
      const data: Partial<AiServiceSettings> = {
        user_id: 'owner',
        max_tokens: 4000,
        profile_settings: {
          chat: { reasoning_effort: 'high', temperature: 0.4 },
        },
        reasoning_effort: 'xhigh',
        supports_audio_input: true,
      };
      const upsert = global
        ? chatRepository.upsertGlobalAiServiceSetting
        : chatRepository.upsertAiServiceSetting;
      await upsert(data);
      let [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain(
        'profile_settings, reasoning_effort, supports_audio_input'
      );
      expect(params.slice(-3)).toEqual([data.profile_settings, 'xhigh', true]);
      expect(
        Math.max(
          ...Array.from(sql.matchAll(/\$(\d+)/g), (match) => Number(match[1]))
        )
      ).toBe(params.length);

      await upsert({ ...data, id: 'service' });
      [sql, params] = query.mock.calls[1] as [string, unknown[]];
      expect(sql).toContain('WHERE id = $15');
      expect(params.slice(-4)).toEqual([
        data.profile_settings,
        'xhigh',
        true,
        'service',
      ]);
      expect(params[6]).toBe(4000);
      expect(release).toHaveBeenCalledTimes(2);
    }
  );
});
