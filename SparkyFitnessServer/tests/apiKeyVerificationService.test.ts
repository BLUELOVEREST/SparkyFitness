import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultKeyHasher } from '@better-auth/api-key';

type MockClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

const { mockGetSystemClient } = vi.hoisted(() => ({
  mockGetSystemClient: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: mockGetSystemClient,
}));

import { verifyApiKeyReadOnly } from '../services/apiKeyVerificationService.js';

function makeClient(row: unknown): MockClient {
  return {
    query: vi.fn().mockResolvedValue({ rows: row ? [row] : [] }),
    release: vi.fn(),
  };
}

describe('apiKeyVerificationService', () => {
  beforeEach(() => {
    mockGetSystemClient.mockReset();
  });

  it('validates an enabled, unexpired API key through a read-only hashed-key lookup', async () => {
    const client = makeClient({
      id: 'key-id',
      reference_id: 'user-id',
      enabled: true,
      expires_at: null,
    });
    mockGetSystemClient.mockResolvedValue(client);

    const result = await verifyApiKeyReadOnly('plain-api-key');

    expect(result).toEqual({
      status: 'valid',
      userId: 'user-id',
      expiresAt: null,
    });
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain('FROM public.api_key');
    expect(client.query.mock.calls[0][0]).not.toMatch(/UPDATE|INSERT|DELETE/i);
    expect(client.query.mock.calls[0][1]).toEqual([
      await defaultKeyHasher('plain-api-key'),
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns disabled without writing when the stored key is disabled', async () => {
    const client = makeClient({
      id: 'key-id',
      reference_id: 'user-id',
      enabled: false,
      expires_at: null,
    });
    mockGetSystemClient.mockResolvedValue(client);

    await expect(verifyApiKeyReadOnly('plain-api-key')).resolves.toEqual({
      status: 'disabled',
    });
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('returns expired without writing when the stored key is expired', async () => {
    const client = makeClient({
      id: 'key-id',
      reference_id: 'user-id',
      enabled: true,
      expires_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    mockGetSystemClient.mockResolvedValue(client);

    await expect(verifyApiKeyReadOnly('plain-api-key')).resolves.toEqual({
      status: 'expired',
    });
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
