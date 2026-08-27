import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { FoodEntry } from '../types/foodEntries';
import type { DailyGoals } from '../types/goals';
import type { ActiveMealPlanDayMeal } from '../types/mealPlan';
import type { MealType } from '../types/mealTypes';
import Icon from './Icon';
import Button from './ui/Button';
import { MEAL_CONFIG } from '../constants/meals';
import SwipeableFoodRow from './SwipeableFoodRow';
import { usePreferences } from '../hooks/usePreferences';
import { createMobileTranslator } from '../utils/mobileI18n';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  getMealGroupLabel,
  groupFoodEntriesByMealType,
  getMealPercentage,
  type MealGroup,
} from '../utils/mealNutrition';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  mealTypes: MealType[];
  goals?: DailyGoals;
  calorieGoal?: number;
  plannedMeals?: ActiveMealPlanDayMeal[];
  isLoggingPlannedMeal?: boolean;
  onLogPlannedMeal?: (meal: ActiveMealPlanDayMeal) => void;
  onPressPlannedMeal?: (meal: ActiveMealPlanDayMeal) => void;
  onAddFood?: () => void;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (
    mealTypeId: string | null,
    mealTypeName: string,
    entries: FoodEntry[],
  ) => void;
}

interface MealSectionProps {
  group: MealGroup;
  goals?: DailyGoals;
  calorieGoal?: number;
  label?: string;
  target?: ActiveMealPlanDayMeal['target'];
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (
    mealTypeId: string | null,
    mealTypeName: string,
    entries: FoodEntry[],
  ) => void;
  targetLabel?: string;
}

const EmptyState: React.FC<{ label?: string; onAddFood?: () => void }> = ({
  label,
  onAddFood,
}) => {
  const { t } = useTranslation();
  const displayLabel =
    label ?? t('foodSummary.tapToAddFood', { defaultValue: 'Tap to add food' });
  return (
    <Pressable
      onPress={onAddFood}
      accessibilityRole="button"
      accessibilityLabel={t('foodSummary.tapToAddFood', {
        defaultValue: 'Tap to add food',
      })}
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6"
    >
      <Text className="text-text-muted text-base">{displayLabel}</Text>
    </Pressable>
  );
};

const MealSection: React.FC<MealSectionProps> = ({
  group,
  goals,
  calorieGoal,
  label,
  target,
  onAdjustServing,
  onPressMealType,
  targetLabel = 'Target',
}) => {
  const { t } = useTranslation();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const displayLabel = label ?? getMealGroupLabel(group, t);
  // Single canonical MEAL_CONFIG lookup (read once, reuse both fields). A
  // custom category named "breakfast" still gets the neutral icon, never the
  // system one — ownership is decided by isSystem, not by the name.
  const systemConfig = group.isSystem
    ? MEAL_CONFIG[group.name.toLowerCase()]
    : undefined;
  const icon = systemConfig?.icon ?? 'meal-snack';

  const totalCalories = calculateMealNutrition(group.entries).values.calories;
  const targetCalories = React.useMemo(() => {
    // Target-calorie percentages are only meaningful for SYSTEM meal types: a
    // custom type named "breakfast" (or a historical group) must never inherit
    // the system Breakfast target calories.
    if (!group.isSystem || !goals || !calorieGoal) return 0;
    const percentage = getMealPercentage(group.name, goals);
    return Math.round((calorieGoal * percentage) / 100);
  }, [group.isSystem, group.name, goals, calorieGoal]);

  const headerContent = (
    <>
      <Icon name={icon} size={18} color={accentPrimary} />
      <Text className="text-base font-bold text-text-secondary flex-1">
        {displayLabel}
      </Text>
      {(totalCalories > 0 || targetCalories > 0) && (
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">
            {totalCalories}
            {targetCalories > 0 ? ` / ${targetCalories}` : ''}{' '}
            {t('foodSummary.caloriesUnit', { defaultValue: 'Cal' })}
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
          onPress={() =>
            onPressMealType(group.mealTypeId, group.name, group.entries)
          }
          className="flex-row gap-2 mb-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('foodSummary.nutritionBreakdown', {
            defaultValue: '{{label}} nutrition breakdown',
            label: displayLabel,
          })}
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
          {t('foodSummary.macroTarget', {
            defaultValue: '{{target}}: C {{carbs}} / P {{protein}} / F {{fat}}',
            target: targetLabel,
            carbs: formatMacroTarget(target.carbs),
            protein: formatMacroTarget(target.protein),
            fat: formatMacroTarget(target.fat),
          })}
        </Text>
      )}
      {group.entries.map((entry, index) => {
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
  if (
    entry.meal_type_id &&
    plannedMeal.mealTypeId &&
    entry.meal_type_id === plannedMeal.mealTypeId
  ) {
    return true;
  }

  const entryMealType = normalizeMealName(entry.meal_type);
  return [plannedMeal.mealType, plannedMeal.key, plannedMeal.label].some(
    value => normalizeMealName(value) === entryMealType,
  );
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
  const { t } = useTranslation();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const isLogDisabled =
    meal.logged || meal.items.length === 0 || !meal.mealTypeId || isLogging;

  return (
    <View className="bg-surface rounded-xl p-4 overflow-hidden shadow-sm border border-accent-primary/20">
      <Pressable
        onPress={() => onPress?.(meal)}
        disabled={!onPress}
        className="flex-row items-center gap-2 mb-2"
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={t('foodSummary.plannedMealDetails', {
          defaultValue: '{{label}} planned meal details',
          label: meal.label,
        })}
      >
        <Icon name="meal" size={18} color={accentPrimary} />
        <Text className="text-base font-bold text-text-secondary flex-1">
          {meal.label}
        </Text>
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">
            {Math.round(meal.target.calories)}{' '}
            {t('foodSummary.caloriesUnit', { defaultValue: 'Cal' })}
          </Text>
        </View>
        {onPress && (
          <Icon name="chevron-forward" size={14} color={accentPrimary} />
        )}
      </Pressable>
      <Text className="text-xs text-text-muted mb-3">
        {t('foodSummary.macroTarget', {
          defaultValue: '{{target}}: C {{carbs}} / P {{protein}} / F {{fat}}',
          target: targetLabel,
          carbs: formatMacroTarget(meal.target.carbs),
          protein: formatMacroTarget(meal.target.protein),
          fat: formatMacroTarget(meal.target.fat),
        })}
      </Text>
      {meal.items.map(item => (
        <View
          key={`${item.type}-${item.id}`}
          className="flex-row justify-between py-1"
        >
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
  mealTypes,
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
  const plannedMealsWithItems =
    plannedMeals?.filter(meal => meal.items.length > 0) ?? [];

  if (foodEntries.length === 0 && plannedMealsWithItems.length === 0) {
    return (
      <EmptyState
        label={t('foodSummary.tapToAddFood', {
          defaultValue: 'Tap to add food',
        })}
        onAddFood={onAddFood}
      />
    );
  }

  const groups = groupFoodEntriesByMealType(foodEntries, mealTypes);
  const plannedLoggedMealSections = plannedMealsWithItems
    .map(meal => ({
      meal,
      entries: foodEntries.filter(entry => matchesPlannedMeal(entry, meal)),
    }))
    .filter(section => section.entries.length > 0);
  const plannedLoggedMealKeys = new Set(
    plannedLoggedMealSections.map(section => section.meal.key),
  );
  const plannedMealCards = plannedMealsWithItems.filter(
    meal => !plannedLoggedMealKeys.has(meal.key),
  );
  const plannedLoggedEntryIds = new Set(
    plannedLoggedMealSections.flatMap(section =>
      section.entries.map(entry => entry.id),
    ),
  );
  const filteredGroups = groups
    .map(group => ({
      ...group,
      entries: group.entries.filter(
        entry => !plannedLoggedEntryIds.has(entry.id),
      ),
    }))
    .filter(group => group.entries.length > 0);
  const plannedLoggedGroups = plannedLoggedMealSections.map(
    ({ meal, entries }) => {
      const matchingType = meal.mealTypeId
        ? mealTypes.find(mealType => mealType.id === meal.mealTypeId)
        : null;
      const group: MealGroup = {
        mealTypeId: meal.mealTypeId ?? null,
        name: matchingType?.name ?? meal.mealType ?? meal.label,
        sortOrder: matchingType?.sort_order ?? 9999,
        entries,
        isSystem: matchingType?.user_id === null,
      };
      return { meal, group };
    },
  );

  if (
    filteredGroups.length === 0 &&
    plannedMealCards.length === 0 &&
    plannedLoggedGroups.length === 0
  ) {
    return (
      <EmptyState
        label={t('foodSummary.tapToAddFood', {
          defaultValue: 'Tap to add food',
        })}
        onAddFood={onAddFood}
      />
    );
  }

  return (
    <View className="gap-2 mb-2">
      {plannedMealCards.map(meal => (
        <PlannedMealCard
          key={meal.key}
          meal={meal}
          isLogging={isLoggingPlannedMeal}
          onLog={onLogPlannedMeal}
          onPress={onPressPlannedMeal}
          targetLabel={t('foodSummary.target', { defaultValue: 'Target' })}
          logFromPlanLabel={t('foodSummary.logFromPlan', {
            defaultValue: 'Log from Plan',
          })}
          loggedFromPlanLabel={t('foodSummary.loggedFromPlan', {
            defaultValue: 'Logged from Plan',
          })}
        />
      ))}
      {plannedLoggedGroups.map(({ meal, group }) => (
        <MealSection
          key={`logged-${meal.mealTypeId ?? meal.key}`}
          group={group}
          label={meal.label}
          target={meal.target}
          goals={goals}
          calorieGoal={calorieGoal}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
          targetLabel={t('foodSummary.target', { defaultValue: 'Target' })}
        />
      ))}
      {filteredGroups.map(group => (
        <MealSection
          key={
            group.mealTypeId
              ? `meal:${group.mealTypeId}`
              : `historical:${group.name.toLowerCase()}`
          }
          group={group}
          goals={goals}
          calorieGoal={calorieGoal}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
        />
      ))}
    </View>
  );
};

export default FoodSummary;
