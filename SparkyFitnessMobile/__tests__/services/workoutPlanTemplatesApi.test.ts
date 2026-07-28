jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '../../src/services/api/apiClient';
import {
  createWorkoutPlanTemplate,
  fetchActiveTrainingFocusPlan,
  fetchWorkoutPlanTemplates,
  updateWorkoutPlanTemplate,
} from '../../src/services/api/workoutPlanTemplatesApi';
import type { SaveWorkoutPlanTemplatePayload } from '../../src/types/workoutPlan';

const focusSessions = [
  {
    day_of_week: 1,
    time_slot: 'morning',
    training_focus: 'back',
    is_primary: true,
  },
] satisfies SaveWorkoutPlanTemplatePayload['focus_sessions'];

describe('workoutPlanTemplatesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches workout plan templates', async () => {
    const templates = [
      {
        id: 'workout-plan-1',
        plan_name: 'Training Focus',
        description: null,
        start_date: '2026-07-13',
        end_date: null,
        is_active: true,
        plan_mode: 'training_focus',
        assignments: [],
        focus_sessions: focusSessions,
      },
    ];
    (apiFetch as jest.Mock).mockResolvedValueOnce(templates);

    await expect(fetchWorkoutPlanTemplates()).resolves.toEqual(templates);

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/workout-plan-templates',
      serviceName: 'Workout Plan Templates API',
      operation: 'fetch workout plan templates',
    });
  });

  it('fetches the active training focus plan for a date', async () => {
    const template = {
      id: 'workout-plan-1',
      plan_name: 'Training Focus',
      description: null,
      start_date: '2026-07-13',
      end_date: null,
      is_active: true,
      plan_mode: 'training_focus',
      assignments: [],
      focus_sessions: focusSessions,
    };
    (apiFetch as jest.Mock).mockResolvedValueOnce(template);

    await expect(fetchActiveTrainingFocusPlan('2026-07-13')).resolves.toEqual(template);

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/workout-plan-templates/active-training-focus/2026-07-13',
      serviceName: 'Workout Plan Templates API',
      operation: 'fetch active training focus plan',
    });
  });

  it('creates a training focus workout plan template', async () => {
    const payload: SaveWorkoutPlanTemplatePayload = {
      plan_name: 'Training Focus',
      description: 'Mobile',
      start_date: '2026-07-13',
      end_date: null,
      is_active: true,
      plan_mode: 'training_focus',
      assignments: [],
      focus_sessions: focusSessions,
    };
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      id: 'workout-plan-1',
      ...payload,
    });

    await expect(createWorkoutPlanTemplate(payload)).resolves.toEqual({
      id: 'workout-plan-1',
      ...payload,
    });

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/workout-plan-templates',
      serviceName: 'Workout Plan Templates API',
      operation: 'create workout plan template',
      method: 'POST',
      body: payload,
    });
  });

  it('updates a training focus workout plan template', async () => {
    const payload: SaveWorkoutPlanTemplatePayload & { id: string } = {
      id: 'workout-plan-1',
      plan_name: 'Training Focus Updated',
      description: null,
      start_date: '2026-07-13',
      end_date: null,
      is_active: true,
      plan_mode: 'training_focus',
      assignments: [],
      focus_sessions: focusSessions,
    };
    (apiFetch as jest.Mock).mockResolvedValueOnce(payload);

    await expect(updateWorkoutPlanTemplate(payload)).resolves.toEqual(payload);

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/workout-plan-templates/workout-plan-1',
      serviceName: 'Workout Plan Templates API',
      operation: 'update workout plan template',
      method: 'PUT',
      body: payload,
    });
  });
});
