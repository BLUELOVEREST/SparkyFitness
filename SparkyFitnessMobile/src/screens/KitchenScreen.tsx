import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateNavigator from '../components/DateNavigator';
import StatusView from '../components/StatusView';
import { useActiveMealPlanDay } from '../hooks/useActiveMealPlanDay';
import { addDays, getTodayDate } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type KitchenScreenProps = RootStackScreenProps<'Kitchen'>;

const formatMacro = (value: number) => `${Math.round(value)}g`;

const KitchenScreen: React.FC<KitchenScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const { activeMealPlanDay, isLoading, isError, refetch } = useActiveMealPlanDay({
    date: selectedDate,
  });

  const meals = activeMealPlanDay?.mode === 'carbCycle'
    ? activeMealPlanDay.meals.filter((meal) => meal.items.length > 0)
    : [];

  const totals = useMemo(() => (
    meals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.target.calories,
        carbs: sum.carbs + meal.target.carbs,
        protein: sum.protein + meal.target.protein,
        fat: sum.fat + meal.target.fat,
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 },
    )
  ), [meals]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-text-muted mt-4">Loading kitchen plan...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <StatusView
        icon="alert-circle"
        iconColor="#EF4444"
        iconSize={64}
        title="Failed to load Kitchen"
        subtitle="Please check your connection and try again."
        action={{ label: 'Retry', onPress: () => refetch(), variant: 'primary' }}
      />
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <DateNavigator
        title="Kitchen"
        selectedDate={selectedDate}
        onPreviousDay={() => setSelectedDate((date) => addDays(date, -1))}
        onNextDay={() => setSelectedDate((date) => addDays(date, 1))}
        onToday={() => setSelectedDate(getTodayDate())}
        onDatePress={() => setSelectedDate(getTodayDate())}
        showDateAlways
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 gap-3"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {meals.length === 0 ? (
          <View className="bg-surface rounded-xl p-4 shadow-sm">
            <Text className="text-text-primary font-bold">No planned meals</Text>
            <Text className="text-text-muted mt-1">
              Create and activate a carb-cycle meal plan on Web first.
            </Text>
          </View>
        ) : (
          <>
            <View className="bg-surface rounded-xl p-4 shadow-sm">
              <Text className="text-text-primary font-bold">
                {activeMealPlanDay?.planName ?? 'Active Meal Plan'}
              </Text>
              <Text className="text-text-muted mt-1">
                {Math.round(totals.calories)} Cal · C {formatMacro(totals.carbs)} · P {formatMacro(totals.protein)} · F {formatMacro(totals.fat)}
              </Text>
            </View>
            {meals.map((meal) => (
              <View key={meal.key} className="bg-surface rounded-xl p-4 shadow-sm">
                <View className="flex-row items-center mb-1">
                  <Text className="text-text-primary font-bold flex-1">
                    {meal.label}
                  </Text>
                  <Text className="text-xs text-accent-primary font-semibold">
                    {Math.round(meal.target.calories)} Cal
                  </Text>
                </View>
                <Text className="text-text-muted text-xs mb-2">
                  C {formatMacro(meal.target.carbs)} · P {formatMacro(meal.target.protein)} · F {formatMacro(meal.target.fat)}
                </Text>
                {meal.items.map((item) => (
                  <View key={`${item.type}-${item.id}`} className="flex-row justify-between mt-2">
                    <Text className="text-text-primary flex-1">{item.name}</Text>
                    <Text className="text-text-muted">{item.amountLabel}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

export default KitchenScreen;
