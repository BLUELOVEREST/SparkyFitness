import { apiFetch } from './apiClient';
import type {
  SaveWorkoutPlanTemplatePayload,
  WorkoutPlanTemplate,
} from '../../types/workoutPlan';

export const fetchWorkoutPlanTemplates = (): Promise<WorkoutPlanTemplate[]> =>
  apiFetch<WorkoutPlanTemplate[]>({
    endpoint: '/api/workout-plan-templates',
    serviceName: 'Workout Plan Templates API',
    operation: 'fetch workout plan templates',
  });

export const fetchActiveTrainingFocusPlan = (
  date: string,
): Promise<WorkoutPlanTemplate | null> =>
  apiFetch<WorkoutPlanTemplate | null>({
    endpoint: `/api/workout-plan-templates/active-training-focus/${encodeURIComponent(date)}`,
    serviceName: 'Workout Plan Templates API',
    operation: 'fetch active training focus plan',
  });

export const createWorkoutPlanTemplate = (
  payload: SaveWorkoutPlanTemplatePayload
): Promise<WorkoutPlanTemplate> =>
  apiFetch<WorkoutPlanTemplate>({
    endpoint: '/api/workout-plan-templates',
    serviceName: 'Workout Plan Templates API',
    operation: 'create workout plan template',
    method: 'POST',
    body: payload,
  });

export const updateWorkoutPlanTemplate = (
  payload: SaveWorkoutPlanTemplatePayload & { id: string }
): Promise<WorkoutPlanTemplate> =>
  apiFetch<WorkoutPlanTemplate>({
    endpoint: `/api/workout-plan-templates/${encodeURIComponent(payload.id)}`,
    serviceName: 'Workout Plan Templates API',
    operation: 'update workout plan template',
    method: 'PUT',
    body: payload,
  });
