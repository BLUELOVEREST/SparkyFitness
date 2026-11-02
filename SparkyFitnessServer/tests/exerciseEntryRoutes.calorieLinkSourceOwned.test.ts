import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error supertest does not ship declarations in this package.
import request from 'supertest';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
// @ts-expect-error multer does not ship declarations in this package.
import multer from 'multer';
import { getClient } from '../db/poolManager.js';
import exerciseEntryRoutes from '../routes/exerciseEntryRoutes.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'owner';
    req.originalUserId = 'owner';
    next();
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../middleware/demoGuardMiddleware.js', () => ({
  demoGuard: (_req: Request, _res: Response, next: NextFunction) => next(),
  demoUploadGuard: (_req: Request, _res: Response, next: NextFunction) =>
    next(),
}));
vi.mock('../middleware/uploadMiddleware.js', () => ({
  createUploadMiddleware: () => multer({ storage: multer.memoryStorage() }),
}));
vi.mock('../services/exerciseService.js', () => ({ default: {} }));
vi.mock('../services/exerciseEntryService.js', () => ({ default: {} }));
vi.mock('../services/fitImportService.js', () => ({ default: {} }));
vi.mock('../utils/permissionUtils.js', () => ({ canAccessUserData: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const ANCHOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const PARENT = '33333333-3333-4333-8333-333333333333';
const LINK = '44444444-4444-4444-8444-444444444444';
const app = express();
app.use(express.json());
app.use('/exercise-entries', exerciseEntryRoutes);
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: error.message });
});

interface Entry {
  id: string;
  source: string | null;
  parent_source: string | null;
  exercise_preset_entry_id: string | null;
  source_id: string | null;
  calorie_link_id: string | null;
  calorie_link_resolution: 'synced' | null;
}

const entry = (id: string, source: string): Entry => ({
  id,
  source,
  parent_source: null,
  exercise_preset_entry_id: null,
  source_id: source === 'manual' ? null : 'provider-id',
  calorie_link_id: null,
  calorie_link_resolution: null,
});
let anchor: Entry;
let target: Entry;
const client = { query: vi.fn(), release: vi.fn() };
const updates = () =>
  client.query.mock.calls.filter(([sql]) => /^\s*UPDATE /i.test(String(sql)));

beforeEach(() => {
  vi.clearAllMocks();
  anchor = entry(ANCHOR, 'manual');
  target = entry(TARGET, 'Garmin');
  vi.mocked(getClient).mockResolvedValue(client as never);
  client.query.mockImplementation(
    async (sql: string, values: unknown[] = []) => {
      if (sql.includes('LEFT JOIN exercise_preset_entries')) {
        // Return protected entries only for the owner-scoped ownership check.
        const ids = values[1] as string[];
        return {
          rows: [anchor, target].filter(
            (row) =>
              ids.includes(row.id) &&
              [row.source, row.parent_source].some(
                (source) => source?.trim().toLowerCase() === 'opengym'
              )
          ),
        };
      }
      const fullRow = (row: Entry) => ({
        ...row,
        entry_date: '2026-10-23',
        entry_time: '10:00:00',
        record_timezone: 'UTC',
        duration_minutes: 30,
        elapsed_time_seconds: null,
        calories_burned: 100,
        exercise_name: 'Workout',
      });
      if (sql.includes('WHERE user_id = $2'))
        return { rows: [fullRow(anchor)] };
      if (/id = \$1 AND user_id = \$2 FOR UPDATE/.test(sql)) {
        return { rows: [fullRow(target)] };
      }
      return { rows: [] };
    }
  );
});

const putLink = () =>
  request(app)
    .put(`/exercise-entries/${ANCHOR}/calorie-link`)
    .send({ synced_entry_id: TARGET, resolution: 'synced' });

describe('source-owned calorie-link API protection', () => {
  it.each([
    ['an openGym grouped child', 'opengym', 'opengym'],
    ['an import identified only by its parent', 'Garmin', 'opengym'],
    ['an ungrouped openGym entry', ' OpenGym ', null],
  ])(
    'rejects a direct link targeting %s before any update',
    async (_name, source, parentSource) => {
      target.source = source;
      target.parent_source = parentSource;
      target.exercise_preset_entry_id = parentSource ? PARENT : null;
      await putLink().expect(409, { error: 'source_owned' });
      expect(updates()).toHaveLength(0);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    }
  );

  it.each(['get', 'put', 'delete'] as const)(
    'rejects a forged %s request anchored to a parent-owned import',
    async (method) => {
      anchor.parent_source = 'opengym';
      anchor.exercise_preset_entry_id = PARENT;
      anchor.calorie_link_id = LINK;
      anchor.calorie_link_resolution = 'synced';
      const url = `/exercise-entries/${ANCHOR}/calorie-link`;
      const response =
        method === 'get'
          ? request(app).get(`${url}/suggestions`)
          : method === 'put'
            ? putLink()
            : request(app).delete(url);
      await response.expect(409, { error: 'source_owned' });
      expect(updates()).toHaveLength(0);
    }
  );

  it('preserves native workout linking to Garmin', async () => {
    await putLink().expect(200);
    expect(updates()).toHaveLength(2);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
