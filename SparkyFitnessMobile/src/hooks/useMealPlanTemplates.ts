import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  createMealPlanTemplate,
  deleteMealPlanTemplate,
  fetchMealPlanTemplates,
  updateMealPlanTemplate,
} from '../services/api/mealPlanTemplatesApi';
import { previewCarbCycleWeek } from '../services/api/goalsApi';
import { fetchMostRecentMeasurement } from '../services/api/measurementsApi';
import {
  mealPlanTemplatesQueryKey,
  mostRecentMeasurementQueryKey,
} from './queryKeys';
import type { QueryClient } from '@tanstack/react-query';
import type {
  MealPlanTemplate,
  SaveMealPlanTemplatePayload,
} from '../types/mealPlan';
import type { CarbCycleInput, CarbCycleWeekResult } from '../types/goals';
import i18n from '../localization/i18n';

const activeMealPlanDayQueryKeyRoot = ['activeMealPlanDay'] as const;

function invalidateMealPlanTemplateCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: mealPlanTemplatesQueryKey });
  queryClient.invalidateQueries({ queryKey: activeMealPlanDayQueryKeyRoot });
}

export function useMealPlanTemplates(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: mealPlanTemplatesQueryKey,
    queryFn: fetchMealPlanTemplates,
    staleTime: 1000 * 60 * 5,
    enabled,
  });

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useMostRecentWeight(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: mostRecentMeasurementQueryKey('weight'),
    queryFn: () => fetchMostRecentMeasurement('weight'),
    staleTime: 1000 * 60 * 5,
    enabled,
  });

  return {
    measurement: query.data,
    weightKg: query.data?.weight ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCreateMealPlanTemplate(options?: {
  onSuccess?: (template: MealPlanTemplate) => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: SaveMealPlanTemplatePayload) =>
      createMealPlanTemplate(payload),
    onSuccess: template => {
      invalidateMealPlanTemplateCaches(queryClient);
      options?.onSuccess?.(template);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('planTemplates.toast.mealCreateFailed', {
          defaultValue: 'Failed to create meal plan',
        }),
        text2: i18n.t('planTemplates.tryAgain', {
          defaultValue: 'Please try again.',
        }),
      });
    },
  });

  return {
    createTemplate: mutation.mutateAsync,
    createTemplateSync: mutation.mutate,
    isPending: mutation.isPending,
  };
}

export function usePreviewCarbCycleWeek(options?: {
  onSuccess?: (preview: CarbCycleWeekResult) => void;
}) {
  const mutation = useMutation({
    mutationFn: (input: CarbCycleInput) => previewCarbCycleWeek(input),
    onSuccess: preview => {
      options?.onSuccess?.(preview);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('planTemplates.toast.mealPreviewFailed', {
          defaultValue: 'Failed to preview carb cycle',
        }),
        text2: i18n.t('planTemplates.toast.mealPreviewHint', {
          defaultValue: 'Check your weight and macro inputs.',
        }),
      });
    },
  });

  return {
    previewCarbCycle: mutation.mutateAsync,
    previewCarbCycleSync: mutation.mutate,
    preview: mutation.data,
    isPending: mutation.isPending,
  };
}

export function useUpdateMealPlanTemplate(options?: {
  templateId?: string;
  onSuccess?: (template: MealPlanTemplate) => void;
}) {
  const queryClient = useQueryClient();
  const { templateId, onSuccess } = options ?? {};

  const mutation = useMutation({
    mutationFn: (payload: SaveMealPlanTemplatePayload) => {
      const id = templateId ?? payload.id;
      if (!id) {
        throw new Error('Meal plan template ID is required.');
      }
      return updateMealPlanTemplate({ ...payload, id });
    },
    onSuccess: template => {
      invalidateMealPlanTemplateCaches(queryClient);
      onSuccess?.(template);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('planTemplates.toast.mealUpdateFailed', {
          defaultValue: 'Failed to update meal plan',
        }),
        text2: i18n.t('planTemplates.tryAgain', {
          defaultValue: 'Please try again.',
        }),
      });
    },
  });

  return {
    updateTemplate: mutation.mutateAsync,
    updateTemplateSync: mutation.mutate,
    isPending: mutation.isPending,
  };
}

export function useDeleteMealPlanTemplate(options?: {
  templateId?: string;
  currentClientDate?: string;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const { templateId, currentClientDate, onSuccess } = options ?? {};

  const mutation = useMutation({
    mutationFn: (id?: string) => {
      const resolvedId = id ?? templateId;
      if (!resolvedId) {
        throw new Error('Meal plan template ID is required.');
      }
      return deleteMealPlanTemplate(resolvedId, currentClientDate);
    },
    onSuccess: () => {
      invalidateMealPlanTemplateCaches(queryClient);
      onSuccess?.();
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('planTemplates.toast.mealDeleteFailed', {
          defaultValue: 'Failed to delete meal plan',
        }),
        text2: i18n.t('planTemplates.tryAgain', {
          defaultValue: 'Please try again.',
        }),
      });
    },
  });

  return {
    deleteTemplate: mutation.mutateAsync,
    deleteTemplateSync: mutation.mutate,
    isPending: mutation.isPending,
  };
}
