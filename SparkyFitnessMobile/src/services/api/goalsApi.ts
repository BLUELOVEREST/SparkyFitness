import { apiFetch } from './apiClient';
import type {
  CarbCycleInput,
  CarbCycleWeekResult,
  DailyGoals,
} from '../../types/goals';

/**
 * Fetches daily goals for a given date.
 */
export const fetchDailyGoals = async (date: string): Promise<DailyGoals> => {
  return apiFetch<DailyGoals>({
    endpoint: `/api/goals/for-date?date=${date}`,
    serviceName: 'Goals API',
    operation: 'fetch goals',
  });
};

export const previewCarbCycleWeek = async (
  input: CarbCycleInput,
): Promise<CarbCycleWeekResult> =>
  apiFetch<CarbCycleWeekResult>({
    endpoint: '/api/weekly-goal-plans/carb-cycle/preview',
    serviceName: 'Goals API',
    operation: 'preview carb cycle week',
    method: 'POST',
    body: input,
  });
