import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error supertest does not ship declarations in this package.
import request from 'supertest';
import express from 'express';
import chatRoutes from '../routes/chatRoutes.js';
import { discoverAiServiceModels } from '../services/aiServiceModelsService.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import chatRepository from '../models/chatRepository.js';
import errorHandler from '../middleware/errorHandler.js';

vi.mock('../services/aiServiceModelsService.js', () => ({
  discoverAiServiceModels: vi.fn(),
}));
vi.mock('../services/chatService.js', () => ({ default: {} }));
vi.mock('../services/voiceTranscriptionService.js', () => ({
  transcribeVoiceAudio: vi.fn(),
}));
vi.mock('../utils/adminCheck.js', () => ({ resolveIsAdmin: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/chatRepository.js', () => ({
  default: { getActiveVisionAiServiceSetting: vi.fn() },
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: { isUserAiConfigAllowed: vi.fn() },
  isPrivateNetworkAiAllowed: vi.fn(),
  isPrivateNetworkFoodProvidersAllowed: vi.fn(),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.userId = 'owner';
    req.authenticatedUserId = 'actor';
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/chat', chatRoutes);
app.use(errorHandler);
const endpoint = '/api/chat/ai-service-settings/models';
const payload = {
  service_type: 'openai_compatible',
  custom_url: 'https://example.com/v1',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveIsAdmin).mockResolvedValue(false);
  vi.mocked(globalSettingsRepository.isUserAiConfigAllowed).mockResolvedValue(
    true
  );
  vi.mocked(discoverAiServiceModels).mockResolvedValue({
    models: [{ id: 'm' }],
  });
});

describe('GET active vision AI service', () => {
  const visionEndpoint = '/api/chat/ai-service-settings/active-vision';
  it('requires authentication', async () => {
    expect((await request(app).get(visionEndpoint)).status).toBe(401);
    expect(
      chatRepository.getActiveVisionAiServiceSetting
    ).not.toHaveBeenCalled();
  });
  it('returns the actual resolver result with credentials stripped', async () => {
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      {
        id: 'vision',
        service_type: 'openai_compatible',
        service_name: 'Vision',
        custom_url: null,
        is_active: true,
        model_name: 'vision-model',
        system_prompt: null,
        is_public: true,
        source: 'global',
        reasoning_effort: null,
        api_key: 'secret',
        encrypted_api_key: 'encrypted',
        api_key_iv: 'iv',
        api_key_tag: 'tag',
      }
    );
    const response = await request(app)
      .get(visionEndpoint)
      .set('Authorization', 'session');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'vision',
      service_type: 'openai_compatible',
      service_name: 'Vision',
      custom_url: null,
      is_active: true,
      model_name: 'vision-model',
      system_prompt: null,
      is_public: true,
      source: 'global',
    });
    expect(chatRepository.getActiveVisionAiServiceSetting).toHaveBeenCalledWith(
      'actor'
    );
  });
  it('returns null when no active setting exists', async () => {
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      null
    );
    const response = await request(app)
      .get(visionEndpoint)
      .set('Authorization', 'session');
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });
});

describe('POST AI service models', () => {
  it('preserves the fixed provider error code through centralized middleware', async () => {
    vi.mocked(discoverAiServiceModels).mockRejectedValue(
      Object.assign(new Error('Unable to retrieve AI service models.'), {
        statusCode: 502,
        code: 'ai_models_auth_failed',
      })
    );
    const response = await request(app)
      .post(endpoint)
      .set('Authorization', 'session')
      .send(payload);
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      error: 'Unable to retrieve AI service models.',
      code: 'ai_models_auth_failed',
    });
  });
  it('requires authentication before discovery', async () => {
    expect((await request(app).post(endpoint).send(payload)).status).toBe(401);
    expect(discoverAiServiceModels).not.toHaveBeenCalled();
  });
  it('enforces the per-user configuration gate', async () => {
    vi.mocked(globalSettingsRepository.isUserAiConfigAllowed).mockResolvedValue(
      false
    );
    expect(
      (
        await request(app)
          .post(endpoint)
          .set('Authorization', 'session')
          .send(payload)
      ).status
    ).toBe(403);
    expect(discoverAiServiceModels).not.toHaveBeenCalled();
  });
  it('allows administrators even with the gate disabled', async () => {
    vi.mocked(resolveIsAdmin).mockResolvedValue(true);
    vi.mocked(globalSettingsRepository.isUserAiConfigAllowed).mockResolvedValue(
      false
    );
    expect(
      (
        await request(app)
          .post(endpoint)
          .set('Authorization', 'session')
          .send(payload)
      ).body
    ).toEqual({ models: [{ id: 'm' }] });
  });
  it('uses the authenticated actor rather than the delegated target', async () => {
    const response = await request(app)
      .post(endpoint)
      .set('Authorization', 'session')
      .send(payload);
    expect(response.status).toBe(200);
    expect(discoverAiServiceModels).toHaveBeenCalledWith(
      payload,
      'actor',
      false
    );
  });
  it.each([{ ...payload, id: 'invalid' }, { service_type: 'openai' }, {}])(
    'rejects invalid input %#',
    async (body) => {
      expect(
        (
          await request(app)
            .post(endpoint)
            .set('Authorization', 'session')
            .send(body)
        ).status
      ).toBe(400);
      expect(discoverAiServiceModels).not.toHaveBeenCalled();
    }
  );
});
