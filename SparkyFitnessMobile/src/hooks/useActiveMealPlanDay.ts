import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  fetchActiveMealPlanDay,
  logActiveMealPlanMealToDiary,
} from '../services/api/mealPlanTemplatesApi';
import { activeMealPlanDayQueryKey, dailySummaryQueryKey } from './queryKeys';
import i18n from '../localization/i18n';

interface UseActiveMealPlanDayOptions {
  date: string;
  enabled?: boolean;
}

export function useActiveMealPlanDay({
  date,
  enabled = true,
}: UseActiveMealPlanDayOptions) {
  const query = useQuery({
    queryKey: activeMealPlanDayQueryKey(date),
    queryFn: () => fetchActiveMealPlanDay(date),
    enabled,
  });

  return {
    activeMealPlanDay: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useLogActiveMealPlanMeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ date, mealTypeId }: { date: string; mealTypeId: string }) =>
      logActiveMealPlanMealToDiary(date, mealTypeId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: activeMealPlanDayQueryKey(variables.date),
      });
      queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(variables.date),
      });
      Toast.show({
        type: 'success',
        text1: i18n.t('planTemplates.toast.plannedMealLogged', {
          defaultValue: 'Planned meal logged',
        }),
      });
    },
    onError: error => {
      const message =
        error instanceof Error
          ? error.message
          : i18n.t('planTemplates.tryAgain', {
              defaultValue: 'Please try again.',
            });
      Toast.show({
        type: 'error',
        text1: i18n.t('planTemplates.toast.plannedMealLogFailed', {
          defaultValue: 'Failed to log planned meal',
        }),
        text2: message,
      });
    },
  });
}
