import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateNavigator from '../components/DateNavigator';
import StatusView from '../components/StatusView';
import { useActiveMealPlanDay } from '../hooks/useActiveMealPlanDay';
import { useActiveMealPlanWeek } from '../hooks/useActiveMealPlanWeek';
import { usePreferences } from '../hooks/usePreferences';
import { addDays, getTodayDate } from '../utils/dateUtils';
import {
  buildKitchenIngredientSummary,
  buildKitchenWeeklyIngredientSummary,
} from '../utils/kitchenPlanSummary';
import { createMobileTranslator } from '../utils/mobileI18n';
import type { RootStackScreenProps } from '../types/navigation';

type KitchenScreenProps = RootStackScreenProps<'Kitchen'>;

const formatMacro = (value: number) => `${Math.round(value)}g`;

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getMondayForWeek = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const mondayOffset = date.getDay() === 0 ? -6 : 1 - date.getDay();
  return addDays(dateString, mondayOffset);
};

const getWeekDays = (dateString: string) => {
  const monday = getMondayForWeek(dateString);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const [, , day] = date.split('-').map(Number);
    const jsDate = new Date(`${date}T00:00:00`);
    return {
      date,
      dayOfMonth: day,
      label: dayNames[jsDate.getDay()],
    };
  });
};

const KitchenScreen: React.FC<KitchenScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const todayDate = getTodayDate();
  const { preferences } = usePreferences();
  const t = useMemo(
    () => createMobileTranslator(preferences?.language),
    [preferences?.language],
  );
  const { activeMealPlanDay, isLoading, isError, refetch } =
    useActiveMealPlanDay({
      date: selectedDate,
    });

  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const weekDates = useMemo(() => weekDays.map(day => day.date), [weekDays]);
  const {
    activeMealPlanDays: activeMealPlanWeekDays,
    isLoading: isWeekLoading,
  } = useActiveMealPlanWeek({
    dates: weekDates,
    enabled: weekDates.length > 0,
  });

  const meals = useMemo(
    () =>
      activeMealPlanDay?.mode === 'carbCycle'
        ? activeMealPlanDay.meals.filter(meal => meal.items.length > 0)
        : [],
    [activeMealPlanDay],
  );

  const totals = useMemo(
    () =>
      meals.reduce(
        (sum, meal) => ({
          calories: sum.calories + meal.target.calories,
          carbs: sum.carbs + meal.target.carbs,
          protein: sum.protein + meal.target.protein,
          fat: sum.fat + meal.target.fat,
        }),
        { calories: 0, carbs: 0, protein: 0, fat: 0 },
      ),
    [meals],
  );
  const ingredientSummary = useMemo(
    () => buildKitchenIngredientSummary(meals),
    [meals],
  );
  const weeklyIngredientSummary = useMemo(
    () => buildKitchenWeeklyIngredientSummary(activeMealPlanWeekDays),
    [activeMealPlanWeekDays],
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-text-muted mt-4">
          {t('kitchen.loading', { defaultValue: 'Loading kitchen plan...' })}
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <StatusView
        icon="alert-circle"
        iconColor="#EF4444"
        iconSize={64}
        title={t('kitchen.failedTitle', {
          defaultValue: 'Failed to load Kitchen',
        })}
        subtitle={t('kitchen.failedSubtitle', {
          defaultValue: 'Please check your connection and try again.',
        })}
        action={{
          label: t('common.retry', { defaultValue: 'Retry' }),
          onPress: () => refetch(),
          variant: 'primary',
        }}
      />
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <DateNavigator
        title={t('kitchen.title', { defaultValue: 'Kitchen' })}
        selectedDate={selectedDate}
        onPreviousDay={() => setSelectedDate(date => addDays(date, -1))}
        onNextDay={() => setSelectedDate(date => addDays(date, 1))}
        onToday={() => setSelectedDate(getTodayDate())}
        onDatePress={() => setSelectedDate(getTodayDate())}
        showDateAlways
      />
      <View className="px-4 pb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {weekDays.map(day => {
            const isSelected = day.date === selectedDate;
            const isToday = day.date === todayDate;
            return (
              <Pressable
                key={day.date}
                testID={`kitchen-week-day-${day.date}`}
                onPress={() => setSelectedDate(day.date)}
                accessibilityRole="button"
                accessibilityLabel={t('kitchen.selectDay', {
                  defaultValue: 'Select {{day}}, {{date}}',
                  day: day.label,
                  date: day.date,
                })}
                accessibilityState={{ selected: isSelected }}
                className={`min-w-14 rounded-2xl px-3 py-2 border ${
                  isSelected
                    ? 'bg-accent-primary border-accent-primary'
                    : 'bg-surface border-border'
                }`}
              >
                <Text
                  className={`text-xs text-center font-semibold ${
                    isSelected ? 'text-white' : 'text-text-muted'
                  }`}
                >
                  {day.label}
                </Text>
                <Text
                  className={`text-base text-center font-bold ${
                    isSelected
                      ? 'text-white'
                      : isToday
                      ? 'text-accent-primary'
                      : 'text-text-primary'
                  }`}
                >
                  {day.dayOfMonth}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 gap-3"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <>
          {meals.length === 0 ? (
            <View className="bg-surface rounded-xl p-4 shadow-sm">
              <Text className="text-text-primary font-bold">
                {t('kitchen.noPlannedMeals', {
                  defaultValue: 'No planned meals',
                })}
              </Text>
              <Text className="text-text-muted mt-1">
                {t('kitchen.noPlannedMealsSubtitle', {
                  defaultValue:
                    'Create and activate a carb-cycle meal plan on Web first.',
                })}
              </Text>
            </View>
          ) : (
            <>
              <View className="bg-surface rounded-xl p-4 shadow-sm">
                <Text className="text-text-primary font-bold">
                  {activeMealPlanDay?.planName ??
                    t('kitchen.activeMealPlan', {
                      defaultValue: 'Active Meal Plan',
                    })}
                </Text>
                <Text className="text-text-muted mt-1">
                  {t('kitchen.macroSummary', {
                    defaultValue:
                      '{{calories}} Cal · C {{carbs}} · P {{protein}} · F {{fat}}',
                    calories: Math.round(totals.calories),
                    carbs: formatMacro(totals.carbs),
                    protein: formatMacro(totals.protein),
                    fat: formatMacro(totals.fat),
                  })}
                </Text>
              </View>
              {ingredientSummary.length > 0 ? (
                <View className="bg-surface rounded-xl p-4 shadow-sm">
                  <Text className="text-text-primary font-bold mb-1">
                    {t('kitchen.ingredientSummary', {
                      defaultValue: 'Ingredient Summary',
                    })}
                  </Text>
                  <Text className="text-text-muted text-xs mb-2">
                    {t('kitchen.ingredientSummarySubtitle', {
                      defaultValue: 'Total amount needed for the selected day.',
                    })}
                  </Text>
                  {ingredientSummary.map(item => (
                    <View
                      key={item.key}
                      className="flex-row items-start justify-between mt-2"
                    >
                      <View className="flex-1 pr-3">
                        <Text className="text-text-primary font-semibold">
                          {item.name}
                        </Text>
                        <Text className="text-text-muted text-xs mt-0.5">
                          {item.mealLabels.join(' · ')}
                        </Text>
                      </View>
                      <Text className="text-text-primary font-semibold">
                        {item.amountLabel}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
          {weeklyIngredientSummary.length > 0 ? (
            <View className="bg-surface rounded-xl p-4 shadow-sm">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-text-primary font-bold">
                  {t('kitchen.weeklyPrep', { defaultValue: 'Weekly Prep' })}
                </Text>
                {isWeekLoading ? (
                  <Text className="text-text-muted text-xs">
                    {t('kitchen.updating', { defaultValue: 'Updating...' })}
                  </Text>
                ) : null}
              </View>
              <Text className="text-text-muted text-xs mb-2">
                {t('kitchen.weeklyPrepSubtitle', {
                  defaultValue: 'Total amount needed for the current week.',
                })}
              </Text>
              {weeklyIngredientSummary.map(item => (
                <View
                  key={item.key}
                  className="flex-row items-start justify-between mt-2"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-text-primary font-semibold">
                      {item.name}
                    </Text>
                    <Text className="text-text-muted text-xs mt-0.5">
                      {item.mealLabels.join(' · ')}
                    </Text>
                  </View>
                  <Text className="text-text-primary font-semibold">
                    {item.amountLabel}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {meals.length > 0 ? (
            <>
              {meals.map(meal => (
                <View
                  key={meal.key}
                  className="bg-surface rounded-xl p-4 shadow-sm"
                >
                  <View className="flex-row items-center mb-1">
                    <Text className="text-text-primary font-bold flex-1">
                      {meal.label}
                    </Text>
                    <Text className="text-xs text-accent-primary font-semibold">
                      {Math.round(meal.target.calories)}{' '}
                      {t('kitchen.caloriesUnit', { defaultValue: 'Cal' })}
                    </Text>
                  </View>
                  <Text className="text-text-muted text-xs mb-2">
                    {t('kitchen.mealMacroSummary', {
                      defaultValue: 'C {{carbs}} · P {{protein}} · F {{fat}}',
                      carbs: formatMacro(meal.target.carbs),
                      protein: formatMacro(meal.target.protein),
                      fat: formatMacro(meal.target.fat),
                    })}
                  </Text>
                  {meal.items.map(item => (
                    <View
                      key={`${item.type}-${item.id}`}
                      className="flex-row justify-between mt-2"
                    >
                      <Text className="text-text-primary flex-1">
                        {item.name}
                      </Text>
                      <Text className="text-text-muted">
                        {item.amountLabel}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          ) : null}
        </>
      </ScrollView>
    </View>
  );
};

export default KitchenScreen;
