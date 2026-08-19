import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';

const { mockVerifyApiKeyReadOnly } = vi.hoisted(() => ({
  mockVerifyApiKeyReadOnly: vi.fn(),
}));

vi.mock('../services/apiKeyVerificationService.js', () => ({
  verifyApiKeyReadOnly: mockVerifyApiKeyReadOnly,
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

vi.mock('../auth.js', () => ({
  auth: {
    api: {
      createApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      listApiKeys: vi.fn(),
    },
  },
}));

import apiKeyRoutes from '../routes/auth/apiKeyRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/identity', apiKeyRoutes);

describe('GET /api/identity/api-key/verify', () => {
  beforeEach(() => {
    mockVerifyApiKeyReadOnly.mockReset();
  });

  it('returns the authenticated user identity for a valid x-api-key without a body', async () => {
    mockVerifyApiKeyReadOnly.mockResolvedValue({
      status: 'valid',
      userId: 'user-id',
      expiresAt: '2026-12-31T00:00:00.000Z',
    });

    const res = await request(app)
      .get('/api/identity/api-key/verify')
      .set('x-api-key', 'plain-api-key');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      authenticated: true,
      user_id: 'user-id',
      expires_at: '2026-12-31T00:00:00.000Z',
    });
    expect(mockVerifyApiKeyReadOnly).toHaveBeenCalledWith('plain-api-key');
  });

  it('rejects missing x-api-key before attempting verification', async () => {
    const res = await request(app).get('/api/identity/api-key/verify');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required.' });
    expect(mockVerifyApiKeyReadOnly).not.toHaveBeenCalled();
  });

  it('uses the existing API-key auth error shapes for invalid, disabled, and expired keys', async () => {
    mockVerifyApiKeyReadOnly
      .mockResolvedValueOnce({ status: 'invalid' })
      .mockResolvedValueOnce({ status: 'disabled' })
      .mockResolvedValueOnce({ status: 'expired' });

    const invalid = await request(app)
      .get('/api/identity/api-key/verify')
      .set('x-api-key', 'invalid-key');
    const disabled = await request(app)
      .get('/api/identity/api-key/verify')
      .set('x-api-key', 'disabled-key');
    const expired = await request(app)
      .get('/api/identity/api-key/verify')
      .set('x-api-key', 'expired-key');

    expect(invalid.status).toBe(401);
    expect(invalid.body).toEqual({ error: 'Authentication required.' });
    expect(disabled.status).toBe(403);
    expect(disabled.body).toEqual({ error: 'API key is disabled.' });
    expect(expired.status).toBe(401);
    expect(expired.body).toEqual({ error: 'API key has expired.' });
  });
});
