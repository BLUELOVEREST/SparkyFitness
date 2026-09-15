export { queryClient } from './queryClient';
export {
  serverConnectionQueryKey,
  serverConfigsQueryKey,
  dailySummaryQueryKey,
  familyUsersQueryKey,
  familyDailySummaryQueryKey,
  measurementsQueryKey,
  mostRecentMeasurementQueryKey,
  preferencesQueryKey,
  waterContainersQueryKey,
  foodsQueryKey,
  foodSearchQueryKey,
  foodsLibraryQueryKey,
  mealsQueryKey,
  mealPlanTemplatesQueryKey,
  mealDetailQueryKey,
  recentMealsQueryKeyRoot,
  recentMealsQueryKey,
  mealSearchQueryKeyRoot,
  mealSearchQueryKey,
  externalProvidersQueryKey,
  externalFoodSearchQueryKey,
  mealTypesQueryKey,
  foodVariantsQueryKey,
  measurementsRangeQueryKey,
  exerciseHistoryQueryKey,
  suggestedExercisesQueryKey,
  exerciseSearchQueryKey,
  exercisesLibraryQueryKey,
  externalExerciseSearchQueryKey,
  workoutPresetsQueryKey,
  workoutPresetSearchQueryKey,
  workoutPresetsLibraryQueryKey,
  activeAiServiceSettingQueryKey,
  userAiConfigAllowedQueryKey,
  fastingRootQueryKey,
  chatHistoryQueryKey,
  medicationsRootQueryKey,
} from './queryKeys';
export { useServerConnection } from './useServerConnection';
export { useServerConfigs } from './useServerConfigs';
export { useSyncHealthData } from './useSyncHealthData';
export { useDailySummary } from './useDailySummary';
export {
  useActiveMealPlanDay,
  useLogActiveMealPlanMeal,
} from './useActiveMealPlanDay';
export { useActiveMealPlanWeek } from './useActiveMealPlanWeek';
export { useFamilyUsers, useFamilyDailySummary } from './useFamilyDiary';
export { useMeasurements } from './useMeasurements';

// Only `useWatchCheckInBridge` is re-exported here: App.tsx mounts it through
// this barrel. `useUpsertCheckIn` and `useWatchConnectivity` are imported by
// their own paths at every call site, so adding them here created exports
// nothing consumes — which `knip` fails the build over.
export { useWatchCheckInBridge } from './useWatchCheckInBridge';

export { usePreferences } from './usePreferences';
export { useRefetchOnFocus } from './useRefetchOnFocus';
export { useWaterIntakeMutation } from './useWaterIntakeMutation';
export { useFoods } from './useFoods';
export { useFavorites } from './useFavorites';
export { useToggleFavorite } from './useToggleFavorite';
export { useDebounce } from './useDebounce';
export { useFoodSearch } from './useFoodSearch';
export { useFoodsLibrary } from './useFoodsLibrary';
export {
  useMeals,
  useRecentMeals,
  useTopMeals,
  useMeal,
  useCreateMeal,
  useUpdateMeal,
  useDeleteMeal,
} from './useMeals';
export {
  useMealPlanTemplates,
  useMostRecentWeight,
  useCreateMealPlanTemplate,
  usePreviewCarbCycleWeek,
  useUpdateMealPlanTemplate,
  useDeleteMealPlanTemplate,
} from './useMealPlanTemplates';
export {
  useMealPlans,
  useCreateMealPlan,
  useUpdateMealPlan,
  useDuplicateMealPlan,
  useDeleteMealPlan,
} from './useMealPlans';
export { useMealPlanNutrition } from './useMealPlanNutrition';
export { useMealSearch } from './useMealSearch';
export {
  useWaterContainersQuery,
  useDrinkPresetCatalogQuery,
  useCreateWaterContainerMutation,
  useUpdateWaterContainerMutation,
  useDeleteWaterContainerMutation,
  useSetPrimaryWaterContainerMutation,
  useReorderWaterContainersMutation,
  useAddDrinkPresetMutation,
} from './useWaterContainers';
export { useExternalProviders } from './useExternalProviders';
export { useExternalFoodSearch } from './useExternalFoodSearch';
export { useAllProvidersSearch } from './useAllProvidersSearch';
export type { ProviderSearchResult } from './useAllProvidersSearch';
export { useMealTypes } from './useMealTypes';
export { useDeleteFood } from './useDeleteFood';
export { useCaffeineKinetics } from './useCaffeineKinetics';
export { useFoodVariants } from './useFoodVariants';
export type { StepsDataPoint, WeightDataPoint } from './useMeasurementsRange';
export { useHealthTrends } from './useHealthTrends';
export { useSuggestedExercises } from './useSuggestedExercises';
export { useExerciseSearch } from './useExerciseSearch';
export { useExercisesLibrary } from './useExercisesLibrary';
export {
  useCreateExercise,
  useUpdateExercise,
  useDeleteExerciseLibrary,
} from './useExerciseMutations';
export { useWorkoutPresets } from './useWorkoutPresets';
export { useWorkoutPresetSearch } from './useWorkoutPresetSearch';
export { useWorkoutPresetsLibrary } from './useWorkoutPresetsLibrary';
export {
  useCreateWorkoutPreset,
  useUpdateWorkoutPreset,
  useDeleteWorkoutPreset,
} from './useWorkoutPresetMutations';
export { useWidgetSync } from './useWidgetSync';
export { useProfile } from './useProfile';
export { useActiveAiServiceSetting } from './useActiveAiServiceSetting';
export { useCustomNutrients } from './useCustomNutrients';
export type { UserCustomNutrient } from './useCustomNutrients';
export { useNutrientDisplayPreferences } from './useNutrientDisplayPreferences';
export { useChatHistory } from './useChatHistory';
export { useCycleMode } from './useCycleMode';
export { useCycleLog, useCycleLogsRange } from './useCycleLogs';
export { useUpsertCycleLog } from './useUpsertCycleLog';
export { useSymptomEntries, useSymptomMutations } from './useSymptoms';
export { useCycleHistory } from './useCycleHistory';
export {
  useCycleOverview,
  useCycleInsights,
  useCycleCorrelations,
} from './useCycleInsights';
export { useCycleTests, useCycleTestMutations } from './useCycleTests';

// --- Medications ---
export {
  useMedications,
  useMedicationDetail,
  useMedicationEntries,
  useCreateMedication,
  useUpdateMedication,
  useDeleteMedication,
  useCreateMedicationEntry,
  useDeleteMedicationEntry,
} from './useMedications';
export {
  useSetFoodEntryImages,
  useClearFoodEntryImage,
  useSetFoodEntryMealImages,
  useClearFoodEntryMealImage,
} from './useEntryImages';
