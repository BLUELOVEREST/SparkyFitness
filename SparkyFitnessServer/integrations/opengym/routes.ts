import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import {
  sparkyGymOwnerControlRequestSchema,
  sparkyGymPurgeRequestSchema,
  sparkyGymSnapshotRequestSchema,
  sparkyGymMediaSchema,
  importedProgressPhotoListSchema,
} from '@workspace/shared';
import { requireSelfActor } from '../../middleware/requireSelfMiddleware.js';
import { listImportedProgressPhotos } from '../../models/importedProgressPhotoRepository.js';
import * as repository from '../../models/sparkyGymRepository.js';
import { isDemoMode } from '../../middleware/demoGuardMiddleware.js';
import {
  sparkyGymService,
  IntegrationError,
  type SparkyGymService,
} from './service.js';
import { sparkyGymRuntime, type SparkyGymRuntime } from './runtime.js';
import { privateArchiveRoot } from './media.js';

const prefix = '/api/integrations/v1';
function errorReply(error: unknown, res: Response, fallback = 500): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  const status =
    error instanceof IntegrationError
      ? error.statusCode
      : error instanceof z.ZodError
        ? 400
        : fallback;
  res.status(status).json({
    error: {
      code:
        error instanceof IntegrationError
          ? error.code
          : status === 400
            ? 'invalid_request'
            : 'integration_unavailable',
    },
  });
}

/** Must be mounted before the global JSON parser, cookies and Better Auth chain. */
export function createSparkyGymPeerRouter(
  service: SparkyGymService = sparkyGymService
): express.Router {
  const router = express.Router({ caseSensitive: true, strict: true });
  let mediaInFlight = 0;
  const endpoints = [
    ['POST', '/pair/claim'],
    ['POST', '/pair/accept'],
    ['POST', '/events'],
    ['GET', '/capabilities'],
    ['POST', '/snapshot'],
    ['POST', '/media'],
    ['POST', '/revoke'],
  ] as const;
  for (const [method, suffix] of endpoints) {
    const handler = async (req: Request, res: Response) => {
      let reserved = false;
      try {
        res.set('Cache-Control', 'no-store');
        if (isDemoMode())
          throw new IntegrationError(403, 'integration_disabled_in_demo');
        if (req.originalUrl !== `${prefix}${suffix}`)
          throw new IntegrationError(400, 'noncanonical_peer_path');
        const context = await service.preauthenticate(
          `${prefix}${suffix}`,
          method,
          {
            keyId: req.get('x-sparkygym-key-id'),
            timestamp: req.get('x-sparkygym-timestamp'),
            signature: req.get('x-sparkygym-signature'),
            requestId: req.get('x-sparkygym-request-id'),
          }
        );
        if (suffix === '/media') {
          service.verifyMediaHeaders(
            context,
            req.get('x-sparkygym-body-sha256')
          );
          if (mediaInFlight >= 1) throw new IntegrationError(429, 'media_busy');
          mediaInFlight++;
          reserved = true;
        }
        const parser = express.raw({
          type: () => true,
          inflate: false,
          limit: suffix === '/media' ? 104923140 : 1048576,
        });
        await new Promise<void>((resolve, reject) =>
          parser(req, res, (error) => (error ? reject(error) : resolve()))
        );
        const body: unknown = req.body;
        const raw = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
        const result = await service.receive(context, raw);
        res.status(result.status).set(result.headers).send(result.body);
      } catch (error) {
        if (error instanceof z.ZodError)
          errorReply(new IntegrationError(401, 'invalid_signature'), res);
        else if (
          error &&
          typeof error === 'object' &&
          'status' in error &&
          (error.status === 413 || error.status === 415)
        )
          errorReply(
            new IntegrationError(error.status, 'unsupported_packet'),
            res
          );
        else errorReply(error, res);
      } finally {
        if (reserved) mediaInFlight--;
      }
    };
    if (method === 'GET') router.get(suffix, handler);
    else router.post(suffix, handler);
  }
  router.use((_req, res) =>
    res.status(404).json({ error: { code: 'unknown_peer_operation' } })
  );
  return router;
}

/** Global authentication must have run; all operations bind the real actor only. */
export function createSparkyGymOwnerRouter(
  service: SparkyGymService = sparkyGymService,
  runtime: SparkyGymRuntime = sparkyGymRuntime
): express.Router {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.authenticatedUserId) {
      errorReply(new IntegrationError(401, 'authentication_required'), res);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.get('x-api-key')) {
        errorReply(new IntegrationError(403, 'owner_session_required'), res);
        return;
      }
      if (!req.is('application/json')) {
        errorReply(new IntegrationError(415, 'json_required'), res);
        return;
      }
    }
    next();
  });
  router.get('/', async (req, res) => {
    try {
      res.json(await service.list(req.authenticatedUserId));
    } catch (error) {
      errorReply(error, res);
    }
  });
  router.post('/invitations', async (req, res) => {
    try {
      res
        .status(201)
        .json(await service.invite(req.authenticatedUserId, req.body));
    } catch (error) {
      errorReply(error, res);
    }
  });
  router.post('/:id/rotate', async (req, res) => {
    try {
      res
        .status(201)
        .json(
          await service.invite(
            req.authenticatedUserId,
            req.body,
            z.uuid().parse(req.params.id)
          )
        );
    } catch (error) {
      errorReply(error, res);
    }
  });
  for (const action of [
    'approve',
    'pause',
    'resume',
    'revoke',
    'snapshot',
    'purge',
  ] as const) {
    router.post(`/:id/${action}`, async (req, res) => {
      try {
        const id = z.uuid().parse(req.params.id);
        let input: { include_history?: boolean } = {};
        if (action === 'snapshot')
          input = sparkyGymSnapshotRequestSchema.parse(req.body);
        else if (action === 'purge')
          sparkyGymPurgeRequestSchema.parse(req.body);
        else sparkyGymOwnerControlRequestSchema.parse(req.body);
        res.json(
          await service.action(req.authenticatedUserId, id, action, input)
        );
      } catch (error) {
        errorReply(error, res);
      }
    });
  }
  /**
   * @swagger
   * /integrations/sparkygym/progress-photos:
   *   get:
   *     summary: List imported openGym progress photos (owner only)
   *     description: Reads existing private archives without creating check-ins. Only ready, live progress images are returned; image bytes require the owner-authenticated media route. Not available in switched or delegated context.
   *     tags: [Wellness & Metrics]
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Newest-first photo metadata; never includes filesystem paths.
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 required: [id, entry_date, source]
   *                 properties:
   *                   id:
   *                     type: string
   *                     format: uuid
   *                   entry_date:
   *                     type: string
   *                     format: date
   *                   source:
   *                     type: string
   *                     enum: [opengym]
   *       401:
   *         description: Authentication required.
   *       403:
   *         description: Switched or delegated context is forbidden.
   */
  router.get('/progress-photos', requireSelfActor, async (req, res) => {
    try {
      res.json(
        importedProgressPhotoListSchema.parse(
          await listImportedProgressPhotos(req.authenticatedUserId)
        )
      );
    } catch (error) {
      errorReply(error, res);
    }
  });
  router.get('/media/:id', requireSelfActor, async (req, res) => {
    try {
      const id = z.uuid().parse(req.params.id);
      const media = await repository.withOwnerTransaction(
        req.authenticatedUserId,
        async (client) => {
          const rows = await client.query(
            `SELECT m.* FROM sparkygym_media m WHERE m.user_id=$1 AND m.id=$2 AND m.status='ready'
             AND EXISTS (SELECT 1 FROM sparkygym_entities e
               WHERE e.user_id=m.user_id AND e.local_id=m.id::text
                 AND e.resource='personal_media' AND NOT e.tombstone)`,
            [req.authenticatedUserId, id]
          );
          return rows.rows[0] ? sparkyGymMediaSchema.parse(rows.rows[0]) : null;
        }
      );
      const root = `${path.resolve(privateArchiveRoot(), req.authenticatedUserId)}${path.sep}`;
      if (
        !media?.private_path ||
        !path.resolve(media.private_path).startsWith(root) ||
        !fs.existsSync(media.private_path)
      )
        throw new IntegrationError(404, 'media_not_found');
      res.set({
        'Content-Type': media.mime,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      });
      res.sendFile(path.resolve(media.private_path), (error) => {
        if (error && !res.headersSent)
          errorReply(new IntegrationError(404, 'media_not_found'), res);
      });
    } catch (error) {
      errorReply(error, res);
    }
  });
  router.get('/notifications', async (req, res) => {
    let closed = false;
    let busy = false;
    let dirty = true;
    let unsubscribe: (() => void) | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const close = () => {
      if (closed) return;
      closed = true;
      unsubscribe?.();
      if (expiry) clearTimeout(expiry);
      if (!res.writableEnded) res.end();
    };
    try {
      let cursor = z
        .string()
        .regex(/^\d{1,19}$/)
        .parse(req.get('last-event-id') ?? req.query.cursor ?? '0');
      if (BigInt(cursor) > 9223372036854775807n)
        throw new IntegrationError(400, 'invalid_notification_cursor');
      const drain = async () => {
        dirty = true;
        if (busy || closed) return;
        busy = true;
        try {
          let sent = 0;
          do {
            dirty = false;
            const page = await repository.replayNotificationPage(
              req.authenticatedUserId,
              cursor
            );
            if (closed) break;
            if (page.snapshot_required || sent >= 1000) {
              res.write(
                `id: ${page.last_cursor}\nevent: snapshot-required\ndata: ${JSON.stringify({ cursor: page.last_cursor })}\n\n`
              );
              close();
              break;
            }
            for (const event of page.notifications) {
              if (
                !res.write(
                  `id: ${event.id}\nevent: committed\ndata: ${JSON.stringify(event)}\n\n`
                )
              ) {
                close();
                break;
              }
              cursor = event.id;
              sent++;
            }
            if (page.notifications.length === 200) dirty = true;
          } while (dirty && !closed);
        } catch {
          close();
        } finally {
          busy = false;
          if (dirty && !closed) void drain();
        }
      };
      unsubscribe = runtime.subscribe(
        req.authenticatedUserId,
        () => {
          void drain();
        },
        close
      );
      res.status(200).set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      res.flushHeaders();
      res.write(': connected\n\n');
      req.on('close', close);
      res.on('error', close);
      // Bound an authenticated stream's lifetime; reconnect revalidates the session.
      expiry = setTimeout(close, 15 * 60 * 1000);
      expiry.unref();
      await drain();
    } catch (error) {
      unsubscribe?.();
      errorReply(error, res, 429);
    }
  });
  return router;
}
