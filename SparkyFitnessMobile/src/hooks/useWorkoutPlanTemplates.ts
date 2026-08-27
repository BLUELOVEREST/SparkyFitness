import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  createWorkoutPlanTemplate,
  fetchActiveTrainingFocusPlan,
  fetchWorkoutPlanTemplates,
  updateWorkoutPlanTemplate,
} from '../services/api/workoutPlanTemplatesApi';
import {
  activeTrainingFocusPlanQueryKey,
  workoutPlanTemplatesQueryKey,
} from './queryKeys';
import type {
  SaveWorkoutPlanTemplatePayload,
  WorkoutPlanTemplate,
} from '../types/workoutPlan';
import i18n from '../localization/i18n';

export function useWorkoutPlanTemplates(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: workoutPlanTemplatesQueryKey,
    queryFn: fetchWorkoutPlanTemplates,
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

export function useActiveTrainingFocusPlan({
  date,
  enabled = true,
}: {
  date: string;
  enabled?: boolean;
}) {
  const query = useQuery({
    queryKey: activeTrainingFocusPlanQueryKey(date),
    queryFn: () => fetchActiveTrainingFocusPlan(date),
    staleTime: 1000 * 60 * 5,
    enabled: enabled && date.length > 0,
  });

  return {
    plan: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useCreateWorkoutPlanTemplate(options?: {
  onSuccess?: (template: WorkoutPlanTemplate) => void;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (payload: SaveWorkoutPlanTemplatePayload) =>
      createWorkoutPlanTemplate(payload),
    onSuccess: template => {
      queryClient.invalidateQueries({ queryKey: workoutPlanTemplatesQueryKey });
      queryClient.invalidateQueries({
        queryKey: activeTrainingFocusPlanQueryKey(template.start_date),
      });
      options?.onSuccess?.(template);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('planTemplates.toast.workoutCreateFailed', {
          defaultValue: 'Failed to create workout plan',
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

export function useUpdateWorkoutPlanTemplate(options?: {
  templateId?: string;
  onSuccess?: (template: WorkoutPlanTemplate) => void;
}) {
  const queryClient = useQueryClient();
  const { templateId, onSuccess } = options ?? {};

  const mutation = useMutation({
    mutationFn: (payload: SaveWorkoutPlanTemplatePayload) => {
      const id = templateId ?? payload.id;
      if (!id) {
        throw new Error('Workout plan template ID is required.');
      }
      return updateWorkoutPlanTemplate({ ...payload, id });
    },
    onSuccess: template => {
      queryClient.invalidateQueries({ queryKey: workoutPlanTemplatesQueryKey });
      queryClient.invalidateQueries({
        queryKey: activeTrainingFocusPlanQueryKey(template.start_date),
      });
      onSuccess?.(template);
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: i18n.t('planTemplates.toast.workoutUpdateFailed', {
          defaultValue: 'Failed to update workout plan',
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
