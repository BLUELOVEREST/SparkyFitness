import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS(7016): supertest has no bundled declarations in this project
import request from 'supertest';
import express from 'express';
import weeklyGoalPlanRoutes from '../routes/weeklyGoalPlanRoutes.js';
import weeklyGoalPlanService from '../services/weeklyGoalPlanService.js';

vi.mock('../services/weeklyGoalPlanService.js', () => ({
  default: {
    createWeeklyGoalPlan: vi.fn(),
    getWeeklyGoalPlans: vi.fn(),
    getActiveWeeklyGoalPlan: vi.fn(),
    updateWeeklyGoalPlan: vi.fn(),
    deleteWeeklyGoalPlan: vi.fn(),
    previewCarbCycleWeek: vi.fn(),
    applyCarbCycleWeek: vi.fn(),
  },
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate: (req: any, _res: any, next: any) => {
    req.userId = 'test-user-id';
    req.authenticatedUserId = 'test-user-id';
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/weekly-goal-plans', weeklyGoalPlanRoutes);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status || 500).json({ error: err.message });
});

describe('Weekly Goal Plan carb cycle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews a carb cycle week', async () => {
    const preview = {
      weekStartDate: '2026-07-06',
      template: [
        'low',
        'medium',
        'medium',
        'high',
        'low',
        'high',
        'medium',
      ] as const,
      weekTotals: { calories: 14210, carbs: 1470, protein: 980, fat: 490 },
      days: [
        {
          date: '2026-07-06',
          dayType: 'low' as const,
          calories: 2104,
          carbs: 110.25,
          protein: 140,
          fat: 122.5,
          trainingSlot: 'rest' as const,
          meals: [
            {
              slotKey: 'morning' as const,
              label: 'Breakfast',
              calories: 526,
              carbs: 27.6,
              protein: 35,
              fat: 30.6,
            },
          ],
        },
      ],
    };
    vi.mocked(weeklyGoalPlanService.previewCarbCycleWeek).mockResolvedValue(
      preview
    );

    const response = await request(app)
      .post('/api/weekly-goal-plans/carb-cycle/preview')
      .send({
        weekStartDate: '2026-07-06',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
      });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(preview);
    expect(weeklyGoalPlanService.previewCarbCycleWeek).toHaveBeenCalledWith({
      weekStartDate: '2026-07-06',
      bodyWeightKg: 70,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
    });
  });

  it('applies carb cycle goals for the authenticated user', async () => {
    const applied = {
      weekStartDate: '2026-07-06',
      template: [
        'low',
        'medium',
        'medium',
        'high',
        'low',
        'high',
        'medium',
      ] as const,
      weekTotals: { calories: 14210, carbs: 1470, protein: 980, fat: 490 },
      days: [],
    };
    vi.mocked(weeklyGoalPlanService.applyCarbCycleWeek).mockResolvedValue(
      applied
    );

    const response = await request(app)
      .post('/api/weekly-goal-plans/carb-cycle/apply')
      .send({
        weekStartDate: '2026-07-06',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
      });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(applied);
    expect(weeklyGoalPlanService.applyCarbCycleWeek).toHaveBeenCalledWith(
      'test-user-id',
      {
        weekStartDate: '2026-07-06',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
      }
    );
  });

  it('returns 400 for invalid carb cycle input', async () => {
    vi.mocked(weeklyGoalPlanService.applyCarbCycleWeek).mockRejectedValue(
      new Error('carbsPerKg must be greater than 0')
    );

    const response = await request(app)
      .post('/api/weekly-goal-plans/carb-cycle/apply')
      .send({
        weekStartDate: '2026-07-06',
        bodyWeightKg: 70,
        carbsPerKg: 0,
        proteinPerKg: 2,
        fatPerKg: 1,
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('carbsPerKg must be greater than 0');
  });

  it('passes persistence failures to the global error handler', async () => {
    vi.mocked(weeklyGoalPlanService.applyCarbCycleWeek).mockRejectedValue(
      new Error('database unavailable')
    );

    const response = await request(app)
      .post('/api/weekly-goal-plans/carb-cycle/apply')
      .send({
        weekStartDate: '2026-07-06',
        bodyWeightKg: 70,
        carbsPerKg: 3,
        proteinPerKg: 2,
        fatPerKg: 1,
      });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe('database unavailable');
  });
});
