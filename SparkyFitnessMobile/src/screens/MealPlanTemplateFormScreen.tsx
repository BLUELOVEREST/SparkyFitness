import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StatusView from '../components/StatusView';
import {
  useCreateMealPlanTemplate,
  useMostRecentWeight,
  usePreviewCarbCycleWeek,
  useUpdateMealPlanTemplate,
} from '../hooks/useMealPlanTemplates';
import { useActiveTrainingFocusPlan } from '../hooks/useWorkoutPlanTemplates';
import { useFoodsLibrary } from '../hooks/useFoodsLibrary';
import { usePreferences } from '../hooks/usePreferences';
import {
  inferMacroRole,
  recommendCarbCycleMealAmounts,
  type FoodMacroRole,
} from '../utils/carbCycleFoodRoles';
import { createMobileTranslator } from '../utils/mobileI18n';
import { formatLocalizedNumber } from '../localization/i18n';
import { getDayName } from '../utils/trainingFocusPlan';
import type { RootStackScreenProps } from '../types/navigation';
import type { CarbCycleDayTarget, CarbCycleWeekResult } from '../types/goals';
import type { FoodItem } from '../types/foods';
import type {
  MealPlanTemplate,
  MealPlanTemplateAssignment,
} from '../types/mealPlan';
import type { WorkoutPlanFocusSession } from '../types/workoutPlan';

type MealPlanTemplateFormScreenProps =
  RootStackScreenProps<'MealPlanTemplateForm'>;

const MACRO_ROLES: FoodMacroRole[] = ['carb', 'protein', 'fat'];
const MACRO_ROLE_LABELS: Record<FoodMacroRole, string> = {
  carb: 'Carbs',
  protein: 'Protein',
  fat: 'Fat',
};
const MACRO_ROLE_TARGET_KEY: Record<
  FoodMacroRole,
  'carbs' | 'protein' | 'fat'
> = {
  carb: 'carbs',
  protein: 'protein',
  fat: 'fat',
};
const TRAINING_WEEK_DAYS = [
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
  { id: 5 },
  { id: 6 },
  { id: 0 },
];

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function getCurrentMonday(): string {
  const now = new Date();
  const utc = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

function buildMacroTargets(preview: CarbCycleWeekResult) {
  return preview.days.reduce<
    Record<number, CarbCycleWeekResult['days'][number]['meals']>
  >((acc, day) => {
    acc[dayOfWeek(day.date)] = day.meals;
    return acc;
  }, {});
}

function normalizeMacroTargets(template: MealPlanTemplate) {
  return Object.fromEntries(
    Object.entries(template.macro_targets ?? {}).map(([day, targets]) => [
      Number(day),
      targets,
    ]),
  ) as NonNullable<MealPlanTemplate['macro_targets']>;
}

function buildPreviewFromTemplate(
  template: MealPlanTemplate,
): CarbCycleWeekResult | null {
  const macroTargets = normalizeMacroTargets(template);
  const days = Object.entries(macroTargets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([dayOfWeekValue, meals]) => {
      const dayOffset =
        (Number(dayOfWeekValue) - dayOfWeek(template.start_date) + 7) % 7;
      const date = addDays(template.start_date, dayOffset);
      const totals = meals.reduce(
        (acc, meal) => ({
          calories: acc.calories + meal.calories,
          carbs: acc.carbs + meal.carbs,
          protein: acc.protein + meal.protein,
          fat: acc.fat + meal.fat,
        }),
        { calories: 0, carbs: 0, protein: 0, fat: 0 },
      );
      return {
        date,
        dayType: 'medium' as const,
        trainingSlot: 'rest' as const,
        meals,
        ...totals,
      } satisfies CarbCycleDayTarget;
    });

  if (days.length === 0) return null;

  const weekTotals = days.reduce(
    (acc, day) => ({
      calories: acc.calories + day.calories,
      carbs: acc.carbs + day.carbs,
      protein: acc.protein + day.protein,
      fat: acc.fat + day.fat,
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 },
  );

  return { weekStartDate: template.start_date, weekTotals, days };
}

function selectionKey(dayDate: string, slotKey: string, role: FoodMacroRole) {
  return `${dayDate}:${slotKey}:${role}`;
}

function mealKey(dayDate: string, slotKey: string) {
  return `${dayDate}:${slotKey}`;
}

function inferFoodMacroRole(food: FoodItem): FoodMacroRole | null {
  if (food.macro_role) return food.macro_role;
  return inferMacroRole({
    carbs: food.default_variant.carbs,
    protein: food.default_variant.protein,
    fat: food.default_variant.fat,
  });
}

function formatAmount(amount: number, unit: string) {
  return `${amount}${unit}`;
}

function formatMacroLine(
  prefix: string,
  values: { carbs: number; protein: number; fat: number },
) {
  const format = (value: number) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  return `${prefix} C ${format(values.carbs)}g · P ${format(
    values.protein,
  )}g · F ${format(values.fat)}g`;
}

function formatSessionCount(count: number) {
  return `${count} session${count === 1 ? '' : 's'}`;
}

function formatTrainingDayLine(
  dayLabel: string,
  sessions: WorkoutPlanFocusSession[],
) {
  const activeSessions = sessions.filter(
    session => session.training_focus !== 'rest',
  );
  const primary = activeSessions.find(session => session.is_primary);
  return `${dayLabel} · ${formatSessionCount(activeSessions.length)} · Main: ${
    primary?.time_slot ?? '—'
  }`;
}

function assignmentToSelectionKey(
  assignment: MealPlanTemplateAssignment,
  templateStartDate: string,
) {
  const role = assignment.macro_role;
  if (!role) return null;
  const dayOffset =
    (assignment.day_of_week - dayOfWeek(templateStartDate) + 7) % 7;
  return selectionKey(
    addDays(templateStartDate, dayOffset),
    assignment.meal_type ?? '',
    role,
  );
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const MealPlanTemplateFormScreen: React.FC<MealPlanTemplateFormScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const template =
    route.params.mode === 'edit' ? route.params.template : undefined;
  const isEditMode = route.params.mode === 'edit';
  const initialPreview = useMemo(
    () => (template ? buildPreviewFromTemplate(template) : null),
    [template],
  );
  const initialSelectedAssignments = useMemo(() => {
    if (!template) return {};
    return Object.fromEntries(
      template.assignments.flatMap(assignment => {
        const key = assignmentToSelectionKey(assignment, template.start_date);
        return key ? [[key, assignment]] : [];
      }),
    ) as Record<string, MealPlanTemplateAssignment>;
  }, [template]);
  const [startDate, setStartDate] = useState(
    template?.start_date ?? getCurrentMonday,
  );
  const [endDate, setEndDate] = useState(template?.end_date ?? '');
  const [planName, setPlanName] = useState(template?.plan_name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [carbsPerKg, setCarbsPerKg] = useState('2');
  const [proteinPerKg, setProteinPerKg] = useState('1.5');
  const [fatPerKg, setFatPerKg] = useState('0.8');
  const [preview, setPreview] = useState<CarbCycleWeekResult | null>(
    initialPreview,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFoods, setSelectedFoods] = useState<Record<string, FoodItem>>(
    {},
  );
  const [selectedAssignments, setSelectedAssignments] = useState<
    Record<string, MealPlanTemplateAssignment>
  >(initialSelectedAssignments);
  const [activeSelection, setActiveSelection] = useState<{
    dayDate: string;
    slotKey: 'morning' | 'noon' | 'afternoon' | 'evening';
    role: FoodMacroRole;
  } | null>(null);
  const [foodSearchText, setFoodSearchText] = useState('');
  const { preferences } = usePreferences();
  const t = useMemo(
    () => createMobileTranslator(preferences?.language),
    [preferences?.language],
  );
  const { weightKg, isLoading: isWeightLoading } = useMostRecentWeight();
  const { previewCarbCycle, isPending: isPreviewPending } =
    usePreviewCarbCycleWeek({
      onSuccess: setPreview,
    });
  const { createTemplate, isPending: isSavePending } =
    useCreateMealPlanTemplate();
  const { updateTemplate, isPending: isUpdatePending } =
    useUpdateMealPlanTemplate({
      templateId: template?.id,
    });
  const {
    foods,
    isLoading: isFoodsLoading,
    isSearching: isFoodsSearching,
    isError: isFoodsError,
    isFetchNextPageError,
    hasNextPage,
    isFetchingNextPage,
    loadMore,
  } = useFoodsLibrary(foodSearchText, { enabled: activeSelection !== null });
  const { plan: activeTrainingFocusPlan, isLoading: isTrainingFocusLoading } =
    useActiveTrainingFocusPlan({
      date: startDate,
      enabled: startDate.length > 0,
    });

  const filteredFoods = useMemo(() => {
    if (!activeSelection) return [];
    return foods.filter(
      food => inferFoodMacroRole(food) === activeSelection.role,
    );
  }, [activeSelection, foods]);

  const selectedAmounts = useMemo(() => {
    if (!preview) return {};
    const amounts: Record<string, number> = {};
    for (const day of preview.days) {
      for (const meal of day.meals) {
        const selectedByRole = MACRO_ROLES.reduce<
          Partial<Record<FoodMacroRole, FoodItem>>
        >((acc, role) => {
          const selected =
            selectedFoods[selectionKey(day.date, meal.slotKey, role)];
          if (selected) acc[role] = selected;
          return acc;
        }, {});
        const result = recommendCarbCycleMealAmounts({
          dayType: day.dayType,
          target: {
            carbs: meal.carbs,
            protein: meal.protein,
            fat: meal.fat,
          },
          foods: Object.fromEntries(
            Object.entries(selectedByRole).map(([role, food]) => [
              role,
              {
                servingSize: food.default_variant.serving_size,
                carbs: food.default_variant.carbs,
                protein: food.default_variant.protein,
                fat: food.default_variant.fat,
              },
            ]),
          ) as Parameters<typeof recommendCarbCycleMealAmounts>[0]['foods'],
        });
        for (const role of MACRO_ROLES) {
          amounts[selectionKey(day.date, meal.slotKey, role)] =
            result.amounts[role];
        }
      }
    }
    return amounts;
  }, [preview, selectedFoods]);

  const mealSelectedTotals = useMemo(() => {
    if (!preview) return {};
    const totals: Record<
      string,
      { carbs: number; protein: number; fat: number }
    > = {};
    for (const day of preview.days) {
      for (const meal of day.meals) {
        const key = mealKey(day.date, meal.slotKey);
        totals[key] = { carbs: 0, protein: 0, fat: 0 };
        for (const role of MACRO_ROLES) {
          const selection = selectionKey(day.date, meal.slotKey, role);
          const food = selectedFoods[selection];
          const amount = selectedAmounts[selection] ?? 0;
          if (!food || amount <= 0 || food.default_variant.serving_size <= 0) {
            continue;
          }
          const scale = amount / food.default_variant.serving_size;
          totals[key].carbs += food.default_variant.carbs * scale;
          totals[key].protein += food.default_variant.protein * scale;
          totals[key].fat += food.default_variant.fat * scale;
        }
      }
    }
    return totals;
  }, [preview, selectedAmounts, selectedFoods]);

  const canGenerate = useMemo(() => {
    return (
      !!weightKg &&
      !!parsePositiveNumber(carbsPerKg) &&
      !!parsePositiveNumber(proteinPerKg) &&
      !!parsePositiveNumber(fatPerKg) &&
      startDate.length > 0
    );
  }, [carbsPerKg, fatPerKg, proteinPerKg, startDate, weightKg]);

  const handleGenerate = async () => {
    setErrorMessage(null);
    if (!weightKg) {
      setErrorMessage('Log a body weight check-in before generating targets.');
      return;
    }

    const parsedCarbs = parsePositiveNumber(carbsPerKg);
    const parsedProtein = parsePositiveNumber(proteinPerKg);
    const parsedFat = parsePositiveNumber(fatPerKg);
    if (!parsedCarbs || !parsedProtein || !parsedFat) {
      setErrorMessage('Macro values must be greater than 0.');
      return;
    }

    const generatedPreview = await previewCarbCycle({
      weekStartDate: startDate,
      bodyWeightKg: weightKg,
      carbsPerKg: parsedCarbs,
      proteinPerKg: parsedProtein,
      fatPerKg: parsedFat,
    });
    setPreview(generatedPreview);
    setSelectedFoods({});
    setSelectedAssignments({});
    setActiveSelection(null);
    setFoodSearchText('');
  };

  const handleSave = async () => {
    if (!preview) {
      setErrorMessage('Generate carb cycle targets before saving.');
      return;
    }

    const normalizedPlanName =
      planName.trim() || `Carb Cycle ${preview.weekStartDate}`;
    const normalizedDescription =
      description.trim() || 'Generated on mobile from carb cycle targets.';
    const normalizedEndDate = endDate.trim() || addDays(startDate, 6);
    const payload = {
      id: template?.id,
      plan_name: normalizedPlanName,
      description: normalizedDescription,
      start_date: startDate,
      end_date: normalizedEndDate,
      is_active: template?.is_active ?? true,
      macro_targets: buildMacroTargets(preview),
      assignments: preview.days.flatMap(day =>
        day.meals.flatMap(meal =>
          MACRO_ROLES.flatMap(role => {
            const key = selectionKey(day.date, meal.slotKey, role);
            const food = selectedFoods[key];
            if (!food) {
              const assignment = selectedAssignments[key];
              if (!assignment) return [];
              return [
                {
                  item_type: 'food' as const,
                  day_of_week: dayOfWeek(day.date),
                  meal_type: meal.slotKey,
                  food_id: assignment.food_id,
                  food_name: assignment.food_name,
                  variant_id: assignment.variant_id,
                  quantity: assignment.quantity,
                  unit: assignment.unit,
                  macro_role: role,
                },
              ];
            }
            return [
              {
                item_type: 'food' as const,
                day_of_week: dayOfWeek(day.date),
                meal_type: meal.slotKey,
                food_id: food.id,
                food_name: food.name,
                variant_id: food.default_variant.id,
                quantity: selectedAmounts[key] ?? 0,
                unit: food.default_variant.serving_unit,
                macro_role: role,
              },
            ];
          }),
        ),
      ),
    };
    if (isEditMode) {
      await updateTemplate(payload);
    } else {
      await createTemplate(payload);
    }
    navigation.goBack();
  };

  const selectFood = (food: FoodItem) => {
    if (!activeSelection) return;
    const key = selectionKey(
      activeSelection.dayDate,
      activeSelection.slotKey,
      activeSelection.role,
    );
    setSelectedFoods(current => ({
      ...current,
      [key]: food,
    }));
    setSelectedAssignments(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setActiveSelection(null);
    setFoodSearchText('');
  };

  const clearSelectedFood = (key: string) => {
    setSelectedFoods(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSelectedAssignments(current => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  if (isWeightLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <StatusView
          loading
          title={t('mealPlan.loadingWeight', {
            defaultValue: 'Loading body weight...',
          })}
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: insets.bottom + 24,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-5">
        <Text className="text-2xl font-bold text-text-primary">
          {planName.trim() ||
            t('mealPlan.newTitle', { defaultValue: 'New Carb Cycle Plan' })}
        </Text>
        <Text className="text-sm text-text-secondary mt-1">
          {t('mealPlan.subtitle', {
            defaultValue:
              'Generate weekly meal targets from your latest body weight.',
          })}
        </Text>
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <Text className="text-sm font-semibold text-text-primary mb-1">
          {t('mealPlan.currentBodyWeight', {
            defaultValue: 'Current body weight',
          })}
        </Text>
        <Text className="text-lg font-bold text-text-primary">
          {weightKg
            ? `${formatLocalizedNumber(weightKg, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })} kg`
            : t('mealPlan.noWeightRecorded', {
                defaultValue: 'No weight recorded',
              })}
        </Text>
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <Text className="text-sm font-semibold text-text-primary mb-3">
          {t('mealPlan.planDetails', { defaultValue: 'Plan details' })}
        </Text>

        <Text className="text-xs text-text-secondary mb-1">
          {t('mealPlan.planName', { defaultValue: 'Plan name' })}
        </Text>
        <TextInput
          className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary mb-3"
          value={planName}
          onChangeText={setPlanName}
          placeholder={t('mealPlan.defaultName', {
            defaultValue: 'Carb Cycle {{date}}',
            date: startDate,
          })}
          autoCapitalize="none"
        />

        <Text className="text-xs text-text-secondary mb-1">
          {t('mealPlan.description', { defaultValue: 'Description' })}
        </Text>
        <TextInput
          className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary mb-3"
          value={description}
          onChangeText={setDescription}
          placeholder={t('mealPlan.optionalNotes', {
            defaultValue: 'Optional notes',
          })}
          autoCapitalize="sentences"
          multiline
        />

        <Text className="text-xs text-text-secondary mb-1">
          {t('mealPlan.weekStartDate', { defaultValue: 'Week start date' })}
        </Text>
        <TextInput
          className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary mb-3"
          value={startDate}
          onChangeText={setStartDate}
          placeholder={t('mealPlan.datePlaceholder', {
            defaultValue: 'YYYY-MM-DD',
          })}
          autoCapitalize="none"
        />

        <Text className="text-xs text-text-secondary mb-1">
          {t('mealPlan.endDate', { defaultValue: 'End date' })}
        </Text>
        <TextInput
          className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary"
          value={endDate}
          onChangeText={setEndDate}
          placeholder={addDays(startDate, 6)}
          autoCapitalize="none"
        />
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <Text className="text-sm font-semibold text-text-primary mb-3">
          {t('mealPlan.inputs', { defaultValue: 'Carb cycle inputs' })}
        </Text>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <Text className="text-xs text-text-secondary mb-1">
              {t('mealPlan.carbsPerKg', { defaultValue: 'Carbs / kg' })}
            </Text>
            <TextInput
              className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary"
              value={carbsPerKg}
              onChangeText={setCarbsPerKg}
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-text-secondary mb-1">
              {t('mealPlan.proteinPerKg', { defaultValue: 'Protein / kg' })}
            </Text>
            <TextInput
              className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary"
              value={proteinPerKg}
              onChangeText={setProteinPerKg}
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-text-secondary mb-1">
              {t('mealPlan.fatPerKg', { defaultValue: 'Fat / kg' })}
            </Text>
            <TextInput
              className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary"
              value={fatPerKg}
              onChangeText={setFatPerKg}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View className="bg-background rounded-xl border border-border-subtle p-3 mt-4">
          <Text className="text-sm font-semibold text-text-primary">
            {t('mealPlan.trainingFocusPlan', {
              defaultValue: 'Training Focus Plan',
            })}
          </Text>
          {isTrainingFocusLoading ? (
            <Text className="text-xs text-text-secondary mt-2">
              {t('mealPlan.loadingTrainingFocus', {
                defaultValue: 'Loading training focus plan...',
              })}
            </Text>
          ) : activeTrainingFocusPlan ? (
            <View className="mt-2">
              <Text className="text-sm font-semibold text-text-primary">
                {activeTrainingFocusPlan.plan_name}
              </Text>
              {TRAINING_WEEK_DAYS.map(day => {
                const sessions = (
                  activeTrainingFocusPlan.focus_sessions ?? []
                ).filter(session => session.day_of_week === day.id);
                return (
                  <Text
                    key={day.id}
                    className="text-xs text-text-secondary mt-1"
                  >
                    {formatTrainingDayLine(getDayName(day.id), sessions)}
                  </Text>
                );
              })}
            </View>
          ) : (
            <Text className="text-xs text-text-secondary mt-2">
              {t('mealPlan.noTrainingFocusPlan', {
                defaultValue:
                  'No active Training Focus Plan covers this start date. Carb cycle targets will use rest-day meal naming until a plan is active.',
              })}
            </Text>
          )}
        </View>

        {errorMessage ? (
          <Text className="text-sm text-red-500 mt-3">{errorMessage}</Text>
        ) : null}

        <Pressable
          className={`rounded-xl py-3 items-center mt-4 ${
            canGenerate ? 'bg-accent-primary' : 'bg-surface-muted'
          }`}
          onPress={() => {
            void handleGenerate();
          }}
          disabled={!canGenerate || isPreviewPending}
        >
          <Text className="text-white font-semibold">
            {isPreviewPending
              ? t('mealPlan.generating', { defaultValue: 'Generating...' })
              : t('mealPlan.generate', {
                  defaultValue: 'Generate Carb Cycle Targets',
                })}
          </Text>
        </Pressable>
      </View>

      {preview ? (
        <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
          <Text className="text-sm font-semibold text-text-primary mb-2">
            {t('mealPlan.weeklyPreview', { defaultValue: 'Weekly Preview' })}
          </Text>
          <Text className="text-xl font-bold text-text-primary">
            {t('mealPlan.caloriesSummary', {
              defaultValue: '{{calories}} kcal',
              calories: Math.round(preview.weekTotals.calories),
            })}
          </Text>
          <Text className="text-sm text-text-secondary mt-1">
            {formatMacroLine('', preview.weekTotals).trim()}
          </Text>
        </View>
      ) : null}

      {preview ? (
        <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
          <Text className="text-sm font-semibold text-text-primary mb-3">
            {t('mealPlan.foodSelection', { defaultValue: 'Food Selection' })}
          </Text>
          {preview.days.map(day => (
            <View key={day.date} className="mb-4">
              <Text className="text-sm font-semibold text-text-primary">
                {day.date} · {day.dayType.toUpperCase()}
              </Text>
              {day.meals.map(meal => (
                <View
                  key={mealKey(day.date, meal.slotKey)}
                  className="mt-3 rounded-xl border border-border-subtle p-3"
                >
                  <Text className="text-sm font-semibold text-text-primary">
                    {meal.label}
                  </Text>
                  <Text className="text-xs text-text-secondary mt-1">
                    {formatMacroLine(
                      t('mealPlan.target', { defaultValue: 'Target' }),
                      {
                        carbs: meal.carbs,
                        protein: meal.protein,
                        fat: meal.fat,
                      },
                    )}
                  </Text>
                  <Text className="text-xs text-text-secondary mt-1">
                    {formatMacroLine(
                      t('mealPlan.total', { defaultValue: 'Total' }),
                      mealSelectedTotals[mealKey(day.date, meal.slotKey)] ?? {
                        carbs: 0,
                        protein: 0,
                        fat: 0,
                      },
                    )}
                  </Text>
                  {MACRO_ROLES.map(role => {
                    const key = selectionKey(day.date, meal.slotKey, role);
                    const selected = selectedFoods[key];
                    const selectedAssignment = selectedAssignments[key];
                    const amount = selectedAmounts[key] ?? 0;
                    const label = MACRO_ROLE_LABELS[role];
                    const hasSelection = selected || selectedAssignment;
                    const selectionLabel = selected
                      ? `${selected.name} · ${formatAmount(
                          amount,
                          selected.default_variant.serving_unit,
                        )}`
                      : selectedAssignment?.food_name
                      ? `${selectedAssignment.food_name} · ${formatAmount(
                          selectedAssignment.quantity ?? 0,
                          selectedAssignment.unit ?? '',
                        )}`
                      : 'None selected';
                    return (
                      <View
                        key={role}
                        className="mt-3 flex-row items-center justify-between"
                      >
                        <View className="flex-1 pr-2">
                          <Text className="text-sm font-medium text-text-primary">
                            {label}
                          </Text>
                          <Text className="text-xs text-text-secondary">
                            {t('mealPlan.target', { defaultValue: 'Target' })}{' '}
                            {formatLocalizedNumber(
                              meal[MACRO_ROLE_TARGET_KEY[role]],
                              {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              },
                            )}
                            g
                          </Text>
                        </View>
                        <View className="flex-1 items-end pr-2">
                          <Text className="text-xs text-text-secondary">
                            {selectionLabel}
                          </Text>
                        </View>
                        <Pressable
                          className="rounded-lg bg-surface-muted px-3 py-2"
                          onPress={() =>
                            setActiveSelection({
                              dayDate: day.date,
                              slotKey: meal.slotKey,
                              role,
                            })
                          }
                        >
                          <Text className="text-xs font-semibold text-text-primary">
                            {hasSelection
                              ? t('mealPlan.change', { defaultValue: 'Change' })
                              : t('mealPlan.selectRole', {
                                  defaultValue: 'Select {{role}}',
                                  role: label,
                                })}
                          </Text>
                        </Pressable>
                        {hasSelection ? (
                          <Pressable
                            className="ml-2 rounded-lg bg-surface-muted px-3 py-2"
                            onPress={() => clearSelectedFood(key)}
                          >
                            <Text className="text-xs font-semibold text-text-primary">
                              {t('mealPlan.clear', { defaultValue: 'Clear' })}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {activeSelection ? (
        <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-semibold text-text-primary">
              {t('mealPlan.selectFood', {
                defaultValue: 'Select {{role}} Food',
                role: MACRO_ROLE_LABELS[activeSelection.role],
              })}
            </Text>
            <Pressable
              className="rounded-lg bg-surface-muted px-3 py-2"
              onPress={() => {
                setActiveSelection(null);
                setFoodSearchText('');
              }}
            >
              <Text className="text-xs font-semibold text-text-primary">
                {t('mealPlan.cancelSelection', {
                  defaultValue: 'Cancel selection',
                })}
              </Text>
            </Pressable>
          </View>
          <TextInput
            className="bg-background border border-border-subtle rounded-xl px-3 py-3 text-text-primary mb-3"
            value={foodSearchText}
            onChangeText={setFoodSearchText}
            placeholder={t('mealPlan.searchFoodDatabase', {
              defaultValue: 'Search food database',
            })}
            autoCapitalize="none"
          />
          {isFoodsLoading || isFoodsSearching ? (
            <Text className="text-sm text-text-secondary">
              {t('mealPlan.searching', { defaultValue: 'Searching...' })}
            </Text>
          ) : null}
          {!isFoodsLoading && !isFoodsSearching && isFoodsError ? (
            <Text className="text-sm text-red-500">
              {t('mealPlan.foodLoadFailed', {
                defaultValue: 'Unable to load food database.',
              })}
            </Text>
          ) : null}
          {!isFoodsLoading &&
          !isFoodsSearching &&
          !isFoodsError &&
          filteredFoods.length === 0 ? (
            <Text className="text-sm text-text-secondary">
              {t('mealPlan.noRoleFoods', {
                defaultValue: 'No {{role}} foods found.',
                role: MACRO_ROLE_LABELS[activeSelection.role],
              })}
            </Text>
          ) : null}
          {filteredFoods.map(food => (
            <Pressable
              key={food.id}
              className="border-b border-border-subtle py-3"
              onPress={() => selectFood(food)}
            >
              <Text className="text-sm font-semibold text-text-primary">
                {food.name}
              </Text>
              <Text className="text-xs text-text-secondary">
                {t('mealPlan.foodNutrition', {
                  defaultValue:
                    'C {{carbs}} · P {{protein}} · F {{fat}} / {{serving}}',
                  carbs: `${food.default_variant.carbs}g`,
                  protein: `${food.default_variant.protein}g`,
                  fat: `${food.default_variant.fat}g`,
                  serving: `${food.default_variant.serving_size}${food.default_variant.serving_unit}`,
                })}
              </Text>
            </Pressable>
          ))}
          {isFetchNextPageError ? (
            <Text className="text-sm text-red-500 mt-3">
              {t('mealPlan.loadMoreFailed', {
                defaultValue: 'Unable to load more foods.',
              })}
            </Text>
          ) : null}
          {hasNextPage ? (
            <Pressable
              className="rounded-xl bg-surface-muted py-3 items-center mt-3"
              onPress={loadMore}
              disabled={isFetchingNextPage}
            >
              <Text className="text-sm font-semibold text-text-primary">
                {isFetchingNextPage
                  ? t('mealPlan.loadingMoreFoods', {
                      defaultValue: 'Loading more foods...',
                    })
                  : t('mealPlan.loadMoreFoods', {
                      defaultValue: 'Load more foods',
                    })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable
        className={`rounded-xl py-3 items-center ${
          preview ? 'bg-accent-primary' : 'bg-surface-muted'
        }`}
        onPress={() => {
          void handleSave();
        }}
        disabled={!preview || isSavePending || isUpdatePending}
      >
        <Text className="text-white font-semibold">
          {isSavePending || isUpdatePending
            ? t('mealPlan.saving', { defaultValue: 'Saving...' })
            : t('mealPlan.save', { defaultValue: 'Save Meal Plan' })}
        </Text>
      </Pressable>
    </ScrollView>
  );
};

export default MealPlanTemplateFormScreen;
