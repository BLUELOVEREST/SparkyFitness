import express from 'express';
// @ts-expect-error TS7016: supertest has no installed declaration package.
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSparkyGymOwnerRouter } from '../integrations/opengym/routes.js';
import * as repository from '../models/sparkyGymRepository.js';

const owner = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const endpoint = '/progress-photos';
function appFor(actor = owner, subject = actor) {
  const app = express();
  app.use((req, _res, next) => {
    req.authenticatedUserId = actor;
    req.userId = subject;
    next();
  });
  app.use(createSparkyGymOwnerRouter());
  return app;
}
afterEach(() => vi.restoreAllMocks());

describe('imported progress photos owner boundary', () => {
  it('lists existing archives without exposing filesystem paths', async () => {
    const transaction = vi.spyOn(repository, 'withOwnerTransaction');
    transaction.mockResolvedValue([
      {
        id,
        entry_date: '2026-10-31',
        source: 'opengym',
        private_path: '/secret',
      },
    ]);
    const response = await request(appFor()).get(endpoint);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id, entry_date: '2026-10-31', source: 'opengym' },
    ]);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(transaction).toHaveBeenCalledWith(owner, expect.any(Function));
  });

  it('rejects switched/delegate context before querying even with check-in permission', async () => {
    const transaction = vi.spyOn(repository, 'withOwnerTransaction');
    const response = await request(appFor(owner, id)).get(endpoint);
    expect(response.status).toBe(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    expect((await request(appFor('', owner)).get(endpoint)).status).toBe(401);
  });

  it('returns no photos for an empty archive', async () => {
    vi.spyOn(repository, 'withOwnerTransaction').mockResolvedValue([]);
    await request(appFor()).get(endpoint).expect(200, []);
  });

  it('keeps media bytes owner-only in switched context', async () => {
    const transaction = vi.spyOn(repository, 'withOwnerTransaction');
    await request(appFor(owner, id)).get(`/media/${id}`).expect(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not serve an unavailable or detached archive', async () => {
    vi.spyOn(repository, 'withOwnerTransaction').mockResolvedValue(null);
    await request(appFor()).get(`/media/${id}`).expect(404);
  });
});
