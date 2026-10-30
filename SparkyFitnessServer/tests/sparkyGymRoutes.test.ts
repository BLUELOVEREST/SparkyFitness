import express from 'express';
// @ts-expect-error TS7016: supertest has no installed declaration package.
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSparkyGymOwnerRouter,
  createSparkyGymPeerRouter,
} from '../integrations/opengym/routes.js';
import {
  IntegrationError,
  SparkyGymService,
} from '../integrations/opengym/service.js';

afterEach(() => vi.restoreAllMocks());
describe('real owner HTTP boundary', () => {
  it('uses the authenticated actor, never the active delegated subject', async () => {
    const service = new SparkyGymService();
    const owner = randomUUID();
    const list = vi
      .spyOn(service, 'list')
      .mockResolvedValue({ connections: [] });
    const app = express();
    app.use((req, _res, next) => {
      req.authenticatedUserId = owner;
      req.userId = randomUUID();
      next();
    });
    app.use('/api/integrations/sparkygym', createSparkyGymOwnerRouter(service));
    await request(app)
      .get('/api/integrations/sparkygym')
      .expect(200, { connections: [] });
    expect(list).toHaveBeenCalledWith(owner);
  });
  it('rejects API-key mutation and non-JSON controls before invoking the service', async () => {
    const service = new SparkyGymService();
    const action = vi.spyOn(service, 'action');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.authenticatedUserId = randomUUID();
      next();
    });
    app.use('/api/integrations/sparkygym', createSparkyGymOwnerRouter(service));
    const endpoint = `/api/integrations/sparkygym/${randomUUID()}/pause`;
    await request(app)
      .post(endpoint)
      .set('x-api-key', 'test-key')
      .send({})
      .expect(403);
    await request(app)
      .post(endpoint)
      .set('Content-Type', 'text/plain')
      .send('{}')
      .expect(415);
    expect(action).not.toHaveBeenCalled();
  });
  it('requires an authenticated identity even when a delegated ID was supplied', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.userId = randomUUID();
      next();
    });
    app.use('/api/integrations/sparkygym', createSparkyGymOwnerRouter());
    await request(app).get('/api/integrations/sparkygym').expect(401);
  });
});
describe('early peer HTTP boundary', () => {
  it('rejects an unknown key before parsing a malformed body with the global parser', async () => {
    const service = new SparkyGymService();
    vi.spyOn(service, 'preauthenticate').mockRejectedValue(
      new IntegrationError(401, 'invalid_signature')
    );
    const receive = vi.spyOn(service, 'receive');
    const app = express();
    app.use('/api/integrations/v1', createSparkyGymPeerRouter(service));
    app.use(express.json());
    await request(app)
      .post('/api/integrations/v1/events')
      .set('Content-Type', 'application/json')
      .send('{ invalid JSON')
      .expect(401);
    expect(receive).not.toHaveBeenCalled();
  });
  it('rejects noncanonical query/trailing paths instead of signing a different URL', async () => {
    const service = new SparkyGymService();
    const auth = vi.spyOn(service, 'preauthenticate');
    const app = express();
    app.use('/api/integrations/v1', createSparkyGymPeerRouter(service));
    await request(app)
      .post('/api/integrations/v1/events?scope=all')
      .send({})
      .expect(400);
    await request(app)
      .post('/api/integrations/v1/events/')
      .send({})
      .expect(404);
    expect(auth).not.toHaveBeenCalled();
  });
});
