import { mealPlanKeys } from '@/api/keys/meals';
import {
  createMealPlanTemplate,
  deleteMealPlanTemplate,
  duplicateMealPlanTemplate,
  getActiveMealPlanDay,
  getMealPlanTemplates,
  logActiveMealPlanMealToDiary,
  updateMealPlanTemplate,
} from '@/api/Foods/mealPlanTemplate';
import { MealPlanTemplate } from '@/types/meal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const useMealPlanTemplates = (userId?: string | null) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: mealPlanKeys.byUser(userId!),
    queryFn: () => getMealPlanTemplates(userId!),
    meta: {
      errorTitle: t('common.error', 'Error'),
      errorMessage: t(
        'mealManagement.failedToLoadMeals',
        'Failed to load meals.'
      ),
    },
    enabled: !!userId,
  });
};

export const useActiveMealPlanDay = (date: string) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: mealPlanKeys.activeDay(date),
    queryFn: () => getActiveMealPlanDay(date),
    enabled: !!date,
    meta: {
      errorMessage: t(
        'mealManagement.failedToLoadActivePlanDay',
        'Failed to load active meal plan for this day.'
      ),
    },
  });
};

export const useLogActiveMealPlanMealMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ date, mealTypeId }: { date: string; mealTypeId: string }) =>
      logActiveMealPlanMealToDiary(date, mealTypeId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: mealPlanKeys.activeDay(variables.date),
      });
      queryClient.invalidateQueries({ queryKey: ['foodEntries'] });
      queryClient.invalidateQueries({ queryKey: ['foodEntryMeals'] });
      queryClient.invalidateQueries({ queryKey: ['dailyProgress'] });
    },
    meta: {
      errorMessage: t(
        'diary.logPlannedMealError',
        'Failed to log planned meal.'
      ),
      successMessage: t('diary.logPlannedMealSuccess', 'Planned meal logged.'),
    },
  });
};
export const useCreateMealPlanMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      userId,
      templateData,
      currentClientDate,
    }: {
      userId: string;
      templateData: Partial<MealPlanTemplate>;
      currentClientDate: string;
    }) => createMealPlanTemplate(userId, templateData, currentClientDate),
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: mealPlanKeys.byUser(variables.userId),
      });
    },
    meta: {
      errorMessage: t(
        'mealManagement.failedToCreateMealPlan',
        'Failed to create meal plan.'
      ),
      successMessage: t(
        'mealManagement.mealPlanCreatedSuccessfully',
        'Meal plan created successfully.'
      ),
    },
  });
};
export const useUpdateMealPlanMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      userId,
      templateData,
      currentClientDate,
    }: {
      userId: string;
      templateData: Partial<MealPlanTemplate>;
      currentClientDate: string;
    }) => updateMealPlanTemplate(userId, templateData, currentClientDate),
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: mealPlanKeys.byUser(variables.userId),
      });
    },
    meta: {
      errorMessage: t(
        'mealManagement.failedToUpdateMealPlan',
        'Failed to update meal plan.'
      ),
      successMessage: t(
        'mealManagement.mealPlanUpdatedSuccessfully',
        'Meal plan updated successfully.'
      ),
    },
  });
};
export const useDeleteMealPlanMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      userId,
      templateId,
      currentClientDate,
    }: {
      userId: string;
      templateId: string;
      currentClientDate?: string;
    }) => deleteMealPlanTemplate(userId, templateId, currentClientDate),
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: mealPlanKeys.byUser(variables.userId),
      });
    },
    meta: {
      errorMessage: t(
        'mealManagement.failedToDeleteMealPlan',
        'Failed to delete meal plan.'
      ),
      successMessage: t(
        'mealManagement.mealPlanDeletedSuccessfully',
        'Meal plan deleted successfully.'
      ),
    },
  });
};

export const useDuplicateMealPlanMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({
      userId,
      templateId,
      currentClientDate,
    }: {
      userId: string;
      templateId: string;
      currentClientDate?: string;
    }) => duplicateMealPlanTemplate(userId, templateId, currentClientDate),
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: mealPlanKeys.byUser(variables.userId),
      });
    },
    meta: {
      errorMessage: t(
        'mealManagement.failedToDuplicateMealPlan',
        'Failed to duplicate meal plan.'
      ),
      successMessage: t(
        'mealManagement.mealPlanDuplicatedSuccessfully',
        'Meal plan duplicated successfully.'
      ),
    },
  });
};
