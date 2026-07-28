import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { FoodEntry } from '../types/foodEntries';
import type { DailyGoals } from '../types/goals';
import type { ActiveMealPlanDayMeal } from '../types/mealPlan';
import Icon, { type IconName } from './Icon';
import Button from './ui/Button';
import { MEAL_TYPES, MEAL_CONFIG } from '../constants/meals';
import SwipeableFoodRow from './SwipeableFoodRow';
import { usePreferences } from '../hooks/usePreferences';
import { createMobileTranslator } from '../utils/mobileI18n';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  getFoodEntryMealTypeKey,
  groupFoodEntriesByMealType,
  getMealPercentage,
  type MealTypeKey,
} from '../utils/mealNutrition';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  goals?: DailyGoals;
  calorieGoal?: number;
  plannedMeals?: ActiveMealPlanDayMeal[];
  isLoggingPlannedMeal?: boolean;
  onLogPlannedMeal?: (meal: ActiveMealPlanDayMeal) => void;
  onPressPlannedMeal?: (meal: ActiveMealPlanDayMeal) => void;
  onAddFood?: () => void;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (mealType: MealTypeKey, entries: FoodEntry[]) => void;
}

interface MealSectionProps {
  mealType: MealTypeKey;
  entries: FoodEntry[];
  goals?: DailyGoals;
  calorieGoal?: number;
  label?: string;
  target?: ActiveMealPlanDayMeal['target'];
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (mealType: MealTypeKey, entries: FoodEntry[]) => void;
  targetLabel?: string;
}

const MealSection: React.FC<MealSectionProps> = ({
  mealType,
  entries,
  goals,
  calorieGoal,
  label,
  target,
  onAdjustServing,
  onPressMealType,
  targetLabel = 'Target',
}) => {
  const config = MEAL_CONFIG[mealType] || { label: mealType, icon: 'meal-snack' as IconName };
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const totalCalories = calculateMealNutrition(entries).values.calories;
  const targetCalories = React.useMemo(() => {
    if (!goals || !calorieGoal) return 0;
    const percentage = getMealPercentage(mealType, goals);
    return Math.round((calorieGoal * percentage) / 100);
  }, [goals, calorieGoal, mealType]);

  const headerContent = (
    <>
      <Icon name={config.icon} size={18} color={accentPrimary} />
      <Text className="text-base font-bold text-text-secondary flex-1">{label ?? config.label}</Text>
      {(totalCalories > 0 || targetCalories > 0) && (
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">
            {totalCalories}
            {targetCalories > 0 ? ` / ${targetCalories}` : ''} Cal
          </Text>
        </View>
      )}
      {onPressMealType && (
        <Icon name="chevron-forward" size={14} color={accentPrimary} />
      )}
    </>
  );

  return (
    <View className="bg-surface rounded-xl p-4 overflow-hidden shadow-sm">
      {onPressMealType ? (
        <Pressable
          onPress={() => onPressMealType(mealType, entries)}
          className="flex-row gap-2 mb-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={`${config.label} nutrition breakdown`}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View className="flex-row gap-2 mb-3 items-center">
          {headerContent}
        </View>
      )}
      {target && (
        <Text className="text-xs text-text-muted mb-3">
          {targetLabel}: C {formatMacroTarget(target.carbs)} / P {formatMacroTarget(target.protein)} / F {formatMacroTarget(target.fat)}
        </Text>
      )}
      {entries.map((entry, index) => {
        const nutrition = calculateEntryNutrition(entry);
        return (
          <SwipeableFoodRow
            key={entry.id || index}
            entry={entry}
            nutrition={nutrition}
            onAdjustServing={onAdjustServing}
          />
        );
      })}
    </View>
  );
};

const formatMacroTarget = (value: number) => `${Math.round(value)}g`;

const normalizeMealName = (value?: string | null) =>
  (value ?? '').trim().toLowerCase();

const matchesPlannedMeal = (
  entry: FoodEntry,
  plannedMeal: ActiveMealPlanDayMeal,
) => {
  if (entry.meal_type_id && plannedMeal.mealTypeId && entry.meal_type_id === plannedMeal.mealTypeId) {
    return true;
  }

  const entryMealType = normalizeMealName(entry.meal_type);
  return [
    plannedMeal.mealType,
    plannedMeal.key,
    plannedMeal.label,
  ].some((value) => normalizeMealName(value) === entryMealType);
};

const PlannedMealCard: React.FC<{
  meal: ActiveMealPlanDayMeal;
  isLogging?: boolean;
  onLog?: (meal: ActiveMealPlanDayMeal) => void;
  onPress?: (meal: ActiveMealPlanDayMeal) => void;
  targetLabel: string;
  logFromPlanLabel: string;
  loggedFromPlanLabel: string;
}> = ({
  meal,
  isLogging,
  onLog,
  onPress,
  targetLabel,
  logFromPlanLabel,
  loggedFromPlanLabel,
}) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const isLogDisabled = meal.logged || meal.items.length === 0 || !meal.mealTypeId || isLogging;

  return (
    <View className="bg-surface rounded-xl p-4 overflow-hidden shadow-sm border border-accent-primary/20">
      <Pressable
        onPress={() => onPress?.(meal)}
        disabled={!onPress}
        className="flex-row items-center gap-2 mb-2"
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={`${meal.label} planned meal details`}
      >
        <Icon name="meal" size={18} color={accentPrimary} />
        <Text className="text-base font-bold text-text-secondary flex-1">
          {meal.label}
        </Text>
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">
            {Math.round(meal.target.calories)} Cal
          </Text>
        </View>
        {onPress && <Icon name="chevron-forward" size={14} color={accentPrimary} />}
      </Pressable>
      <Text className="text-xs text-text-muted mb-3">
        {targetLabel}: C {formatMacroTarget(meal.target.carbs)} / P {formatMacroTarget(meal.target.protein)} / F {formatMacroTarget(meal.target.fat)}
      </Text>
      {meal.items.map((item) => (
        <View key={`${item.type}-${item.id}`} className="flex-row justify-between py-1">
          <Text className="text-sm text-text-primary flex-1">{item.name}</Text>
          <Text className="text-sm text-text-muted">{item.amountLabel}</Text>
        </View>
      ))}
      <Button
        variant={meal.logged ? 'secondary' : 'primary'}
        className="mt-3"
        disabled={isLogDisabled}
        onPress={() => onLog?.(meal)}
      >
        {meal.logged ? loggedFromPlanLabel : logFromPlanLabel}
      </Button>
    </View>
  );
};

const FoodSummary: React.FC<FoodSummaryProps> = ({
  foodEntries,
  goals,
  calorieGoal,
  plannedMeals,
  isLoggingPlannedMeal,
  onLogPlannedMeal,
  onPressPlannedMeal,
  onAddFood,
  onAdjustServing,
  onPressMealType,
}) => {
  const { preferences } = usePreferences();
  const t = createMobileTranslator(preferences?.language);
  const plannedMealsWithItems = plannedMeals?.filter((meal) => meal.items.length > 0) ?? [];

  if (foodEntries.length === 0 && plannedMealsWithItems.length === 0) {
    return (
      <Pressable onPress={onAddFood} className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">
          {t('foodSummary.tapToAddFood')}
        </Text>
      </Pressable>
    );
  }

  const grouped = groupFoodEntriesByMealType(foodEntries);
  const plannedLoggedMealSections = plannedMealsWithItems
    .map((meal) => ({
      meal,
      entries: foodEntries.filter((entry) => matchesPlannedMeal(entry, meal)),
    }))
    .filter((section) => section.entries.length > 0);
  const plannedLoggedMealKeys = new Set(
    plannedLoggedMealSections.map((section) => section.meal.key),
  );
  const plannedMealCards = plannedMealsWithItems.filter(
    (meal) => !plannedLoggedMealKeys.has(meal.key),
  );
  const plannedLoggedEntryIds = new Set(
    plannedLoggedMealSections.flatMap((section) => section.entries.map((entry) => entry.id)),
  );
  const mealTypesWithEntries = MEAL_TYPES.filter((mealType) =>
    grouped[mealType].some((entry) => !plannedLoggedEntryIds.has(entry.id))
  );
  const hasOther = grouped.other.some((entry) => !plannedLoggedEntryIds.has(entry.id));

  if (
    mealTypesWithEntries.length === 0 &&
    !hasOther &&
    plannedMealCards.length === 0 &&
    plannedLoggedMealSections.length === 0
  ) {
    return (
      <Pressable onPress={onAddFood} className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">
          {t('foodSummary.tapToAddFood')}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-2 mb-2">
      {plannedMealCards.map((meal) => (
        <PlannedMealCard
          key={meal.key}
          meal={meal}
          isLogging={isLoggingPlannedMeal}
          onLog={onLogPlannedMeal}
          onPress={onPressPlannedMeal}
          targetLabel={t('foodSummary.target')}
          logFromPlanLabel={t('foodSummary.logFromPlan')}
          loggedFromPlanLabel={t('foodSummary.loggedFromPlan')}
        />
      ))}
      {plannedLoggedMealSections.map(({ meal, entries }) => (
        <MealSection
          key={`logged-${meal.mealTypeId ?? meal.key}`}
          mealType={getFoodEntryMealTypeKey(entries[0])}
          label={meal.label}
          target={meal.target}
          entries={entries}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
          targetLabel={t('foodSummary.target')}
        />
      ))}
      {mealTypesWithEntries.map((mealType) => (
        <MealSection
          key={mealType}
          mealType={mealType}
          entries={grouped[mealType].filter((entry) => !plannedLoggedEntryIds.has(entry.id))}
          goals={goals}
          calorieGoal={calorieGoal}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
        />
      ))}
      {hasOther && (
        <MealSection
          mealType="other"
          entries={grouped.other.filter((entry) => !plannedLoggedEntryIds.has(entry.id))}
          goals={goals}
          calorieGoal={calorieGoal}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
        />
      )}
    </View>
  );
};

export default FoodSummary;
