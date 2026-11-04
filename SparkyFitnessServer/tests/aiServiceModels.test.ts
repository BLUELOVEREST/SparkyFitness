import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutboundUrlBlockedError } from '../utils/outboundUrlPolicy.js';
import { isPrivateNetworkAiAllowed } from '../models/globalSettingsRepository.js';
import { discoverAiServiceModels } from '../services/aiServiceModelsService.js';
import chatRepository from '../models/chatRepository.js';
import {
  aiServiceModelsRequestSchema,
  aiServiceModelsResponseSchema,
} from '@workspace/shared';

vi.mock('../models/chatRepository.js', () => ({
  default: {
    getAiServiceDiscoverySetting: vi.fn(),
    getDecryptedAiServiceSettingById: vi.fn(),
  },
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  isPrivateNetworkAiAllowed: vi.fn().mockResolvedValue(false),
  isPrivateNetworkFoodProvidersAllowed: vi.fn().mockResolvedValue(false),
}));

const payload = {
  service_type: 'openai_compatible' as const,
  custom_url: 'https://example.com/v1',
};
const id = 'fe3f7c41-dfb5-4c44-aa88-c9875ca25bc4';
const fetchMock = vi.fn<typeof fetch>();
const stored = {
  user_id: 'owner',
  is_public: false,
  service_type: 'openai_compatible',
  custom_url: payload.custom_url,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  delete process.env.ALLOW_PRIVATE_NETWORK_AI;
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [
          { id: 'model-1', secret: 'discard' },
          { id: 'model-1' },
          { id: 'model-2' },
        ],
      })
    )
  );
  vi.mocked(chatRepository.getAiServiceDiscoverySetting).mockResolvedValue(
    stored
  );
  vi.mocked(chatRepository.getDecryptedAiServiceSettingById).mockResolvedValue({
    ...stored,
    model_name: null,
    max_tokens: null,
    profile_settings: null,
    reasoning_effort: 'medium',
    api_key: 'stored-secret',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AI model discovery', () => {
  it('normalizes DNS policy denials wrapped by native fetch without exposing addresses', async () => {
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed', {
        cause: new OutboundUrlBlockedError('secret private address'),
      })
    );
    await expect(
      discoverAiServiceModels(payload, 'owner', false)
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'AI service URL is not allowed by the network policy.',
    });
  });

  it('allows operator-authorized LAN endpoints for non-admins', async () => {
    vi.mocked(isPrivateNetworkAiAllowed).mockResolvedValueOnce(true);
    await expect(
      discoverAiServiceModels(
        { ...payload, custom_url: 'http://192.168.1.2:1234/v1' },
        'owner',
        false
      )
    ).resolves.toHaveProperty('models');
  });

  it('bounds the entire fetch including body reads to 15 seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await discoverAiServiceModels(payload, 'owner', false);
    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it('rejects a declared oversized response before reading it', async () => {
    const response = new Response('small', {
      headers: { 'Content-Length': String(1024 * 1024 + 1) },
    });
    fetchMock.mockResolvedValue(response);
    await expect(
      discoverAiServiceModels(payload, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(response.body?.locked).toBe(false);
  });

  it('does not reflect arbitrary repository messages even with an HTTP status', async () => {
    vi.mocked(
      chatRepository.getAiServiceDiscoverySetting
    ).mockRejectedValueOnce(
      Object.assign(new Error('secret SQL or key'), { statusCode: 400 })
    );
    await expect(
      discoverAiServiceModels({ ...payload, id }, 'owner', false)
    ).rejects.toMatchObject({
      statusCode: 502,
      message: 'Unable to retrieve AI service models.',
    });
  });
  it('exports bounded shared request and response contracts', () => {
    expect(
      aiServiceModelsRequestSchema.safeParse({ ...payload, id }).success
    ).toBe(true);
    for (const body of [
      { ...payload, id: 'bad' },
      { service_type: 'openai' },
    ]) {
      expect(aiServiceModelsRequestSchema.safeParse(body).success).toBe(false);
    }
    expect(
      aiServiceModelsResponseSchema.parse({
        models: [{ id: 'm', key: 'discard' }],
      })
    ).toEqual({ models: [{ id: 'm' }] });
    expect(
      aiServiceModelsResponseSchema.safeParse({ models: [{ id: '' }] }).success
    ).toBe(false);
  });

  it.each([
    ['https://example.com', 'https://example.com/models'],
    ['https://example.com/v1/', 'https://example.com/v1/models'],
    [
      'https://example.com/prefix/v1/chat/completions/',
      'https://example.com/prefix/v1/models',
    ],
  ])(
    'normalizes %s and returns only unique model IDs',
    async (custom_url, expected) => {
      expect(
        await discoverAiServiceModels(
          { ...payload, custom_url, api_key: 'draft' },
          'owner',
          false
        )
      ).toEqual({ models: [{ id: 'model-1' }, { id: 'model-2' }] });
      expect(fetchMock).toHaveBeenCalledWith(
        expected,
        expect.objectContaining({
          method: 'GET',
          redirect: 'manual',
          headers: { Authorization: 'Bearer draft' },
          signal: expect.any(AbortSignal),
        })
      );
    }
  );

  it('loads the saved own URL and key', async () => {
    await discoverAiServiceModels(
      { service_type: 'openai_compatible', id },
      'owner',
      false
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer stored-secret' },
      })
    );
  });

  it.each([
    { ...stored, user_id: 'someone-else' },
    { ...stored, is_public: true },
  ])('rejects inaccessible credentials before decrypting', async (row) => {
    vi.mocked(chatRepository.getAiServiceDiscoverySetting).mockResolvedValue(
      row
    );
    await expect(
      discoverAiServiceModels({ ...payload, id }, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(
      chatRepository.getDecryptedAiServiceSettingById
    ).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an administrator to discover a global service', async () => {
    vi.mocked(chatRepository.getAiServiceDiscoverySetting).mockResolvedValue({
      ...stored,
      user_id: 'admin',
      is_public: true,
    });
    await expect(
      discoverAiServiceModels({ ...payload, id }, 'owner', true)
    ).resolves.toHaveProperty('models');
  });

  it.each([
    { ...stored, service_type: 'openai' },
    { ...stored, custom_url: 'https://other.example/v1' },
  ])(
    'rejects provider or URL changes without decrypting the saved key',
    async (row) => {
      vi.mocked(chatRepository.getAiServiceDiscoverySetting).mockResolvedValue(
        row
      );
      await expect(
        discoverAiServiceModels({ ...payload, id }, 'owner', false)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(
        chatRepository.getDecryptedAiServiceSettingById
      ).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('uses an explicit draft key for a changed endpoint without decrypting', async () => {
    await discoverAiServiceModels(
      { ...payload, id, custom_url: 'https://other.example', api_key: 'draft' },
      'owner',
      false
    );
    expect(
      chatRepository.getDecryptedAiServiceSettingById
    ).not.toHaveBeenCalled();
  });

  it('rejects a missing saved row', async () => {
    vi.mocked(chatRepository.getAiServiceDiscoverySetting).mockResolvedValue(
      null
    );
    await expect(
      discoverAiServiceModels({ ...payload, id }, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    'http://127.0.0.1:8080',
    'http://169.254.169.254',
    'http://localhost',
    'http://[::1]',
  ])('blocks unauthorized private URL %s', async (custom_url) => {
    await expect(
      discoverAiServiceModels({ ...payload, custom_url }, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permits administrator LAN endpoints', async () => {
    await expect(
      discoverAiServiceModels(
        { ...payload, custom_url: 'http://192.168.1.2:1234/v1' },
        'owner',
        true
      )
    ).resolves.toHaveProperty('models');
  });

  it.each([
    'file:///etc/passwd',
    'https://key:secret@example.com/v1',
    'https://example.com/v1#fragment',
    'https://example.com/v1?key=secret',
    '',
  ])('rejects unsafe or missing URL %s', async (custom_url) => {
    await expect(
      discoverAiServiceModels({ ...payload, custom_url }, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([301, 302, 307, 308, 401, 403, 404, 429, 500])(
    'normalizes provider status %s without reflecting secrets',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('stored-secret upstream diagnostics', {
          status,
          headers: { Location: 'https://attacker.example' },
        })
      );
      await expect(
        discoverAiServiceModels(payload, 'owner', false)
      ).rejects.toMatchObject({
        statusCode: 502,
        message: 'Unable to retrieve AI service models.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    'not json',
    '{}',
    '{"data":[{"id":""}]}',
    JSON.stringify({ data: Array.from({ length: 1001 }, () => ({ id: 'm' })) }),
    'x'.repeat(1024 * 1024 + 1),
  ])('rejects malformed or oversized provider data %#', async (body) => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(
      discoverAiServiceModels(payload, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('normalizes network errors without exposing provider diagnostics', async () => {
    fetchMock.mockRejectedValue(new Error('secret provider detail'));
    await expect(
      discoverAiServiceModels(payload, 'owner', false)
    ).rejects.toMatchObject({
      statusCode: 502,
      message: 'Unable to retrieve AI service models.',
    });
  });

  it.each([
    [401, 'ai_models_auth_failed'],
    [403, 'ai_models_auth_failed'],
    [404, 'ai_models_unsupported'],
    [405, 'ai_models_unsupported'],
    [429, 'ai_models_rate_limited'],
  ])(
    'provides a safe error code for provider status %s',
    async (status, code) => {
      fetchMock.mockResolvedValue(
        new Response('secret', { status: Number(status) })
      );
      await expect(
        discoverAiServiceModels(payload, 'owner', false)
      ).rejects.toMatchObject({ statusCode: 502, code });
    }
  );

  it('normalizes timeout errors distinctly', async () => {
    fetchMock.mockRejectedValue(new DOMException('secret', 'TimeoutError'));
    await expect(
      discoverAiServiceModels(payload, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 504, code: 'ai_models_timeout' });
  });

  it('normalizes native fetch connector timeouts distinctly', async () => {
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('secret endpoint'), {
          code: 'UND_ERR_CONNECT_TIMEOUT',
        }),
      })
    );
    await expect(
      discoverAiServiceModels(payload, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 504, code: 'ai_models_timeout' });
  });

  it('rechecks private credential ownership after decryption', async () => {
    vi.mocked(
      chatRepository.getDecryptedAiServiceSettingById
    ).mockResolvedValue({
      ...stored,
      user_id: 'other',
      model_name: null,
      max_tokens: null,
      profile_settings: null,
      reasoning_effort: 'medium',
      api_key: 'secret',
    });
    await expect(
      discoverAiServiceModels({ ...payload, id }, 'owner', false)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
