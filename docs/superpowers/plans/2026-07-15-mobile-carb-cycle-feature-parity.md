# Mobile Carb Cycle Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Android APK up to the practical feature level needed for Eric's carb-cycle workflow: view planned meals, log planned meals from Diary, and optionally use a Kitchen preview on mobile.

**Architecture:** Keep the backend as the source of truth. The mobile app should consume the same server endpoints already added for the Web frontend, and only add native UI around those APIs. Prioritize mobile consumption workflows first; creation/editing of carb-cycle plans can remain Web-only until the daily workflow is stable.

**Tech Stack:** Expo / React Native, React Navigation, TanStack Query, existing `apiFetch` client, existing `DailySummary` and food-entry cache patterns.

---

## Scope And Order

This is intentionally staged:

1. **Diary plan consumption**: APK can show today's active carb-cycle planned meals and log one planned meal into Diary.
2. **Kitchen preview**: APK gets a read-only weekly cooking page, using the same active plan data.
3. **Mobile creation/editing**: APK can create/edit Training Focus and Carb Cycle Meal Plans. This is lower priority because planning is still more comfortable on Web.

The first implementation pass should complete Tasks 1-4 only. Task 5 is a later phase.

## File Map

- Create `SparkyFitnessMobile/src/types/mealPlan.ts`: shared mobile types for active planned day, planned meals, and planned items.
- Create `SparkyFitnessMobile/src/services/api/mealPlanTemplatesApi.ts`: server API wrappers for active day lookup and log-to-diary mutation.
- Modify `SparkyFitnessMobile/src/hooks/queryKeys.ts`: add query keys for active meal plan day.
- Create `SparkyFitnessMobile/src/hooks/useActiveMealPlanDay.ts`: TanStack Query hook and log mutation.
- Modify `SparkyFitnessMobile/src/components/FoodSummary.tsx`: show planned meals alongside logged food entries.
- Modify `SparkyFitnessMobile/src/screens/DiaryScreen.tsx`: load active planned day, pass data into `FoodSummary`, and refresh it with daily summary.
- Modify `SparkyFitnessMobile/src/screens/MealTypeDetailScreen.tsx`: show the selected meal's planned target/items and log-from-plan action.
- Create `SparkyFitnessMobile/src/screens/KitchenScreen.tsx`: read-only active meal plan preview.
- Modify `SparkyFitnessMobile/src/types/navigation.ts`: add Kitchen route.
- Modify `SparkyFitnessMobile/App.tsx`: register Kitchen stack screen.
- Modify `SparkyFitnessMobile/src/components/TabsLayout.tsx` or `SparkyFitnessMobile/src/screens/LibraryScreen.tsx`: expose Kitchen entry.
- Add tests under `SparkyFitnessMobile/__tests__/services/` and `SparkyFitnessMobile/__tests__/components/`.

---

### Task 1: Add Mobile API Types And Endpoint Wrappers

**Files:**
- Create: `SparkyFitnessMobile/src/types/mealPlan.ts`
- Create: `SparkyFitnessMobile/src/services/api/mealPlanTemplatesApi.ts`
- Modify: `SparkyFitnessMobile/src/hooks/queryKeys.ts`
- Test: `SparkyFitnessMobile/__tests__/services/mealPlanTemplatesApi.test.ts`

- [ ] **Step 1: Add active meal plan types**

Create `SparkyFitnessMobile/src/types/mealPlan.ts`:

```ts
export interface PlannedMealItem {
  id: string;
  type: 'food' | 'meal';
  name: string;
  amountLabel: string;
  macroRole?: 'carb' | 'protein' | 'fat' | null;
}

export interface ActiveMealPlanDayMeal {
  mealTypeId: string | null;
  key: string;
  label: string;
  target: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
  };
  items: PlannedMealItem[];
  logged: boolean;
  loggedFoodEntryMealId?: string | null;
}

export interface ActiveMealPlanDay {
  mode: 'average' | 'carbCycle';
  date: string;
  templateId?: string;
  planName?: string;
  meals: ActiveMealPlanDayMeal[];
}
```

- [ ] **Step 2: Add API wrappers**

Create `SparkyFitnessMobile/src/services/api/mealPlanTemplatesApi.ts`:

```ts
import { apiFetch } from './apiClient';
import type { ActiveMealPlanDay } from '../../types/mealPlan';

export const fetchActiveMealPlanDay = (date: string): Promise<ActiveMealPlanDay> =>
  apiFetch<ActiveMealPlanDay>({
    endpoint: `/api/meal-plan-templates/active/day?date=${encodeURIComponent(date)}`,
    serviceName: 'Meal Plan Templates API',
    operation: 'fetch active meal plan day',
  });

export const logActiveMealPlanMealToDiary = (
  date: string,
  mealTypeId: string,
): Promise<{ foodEntryMealId: string }> =>
  apiFetch<{ foodEntryMealId: string }>({
    endpoint: '/api/meal-plan-templates/active/log-meal-to-diary',
    serviceName: 'Meal Plan Templates API',
    operation: 'log planned meal to diary',
    method: 'POST',
    body: { date, mealTypeId },
  });
```

- [ ] **Step 3: Add query keys**

Modify `SparkyFitnessMobile/src/hooks/queryKeys.ts`:

```ts
export const activeMealPlanDayQueryKey = (date: string) =>
  ['activeMealPlanDay', date] as const;
```

- [ ] **Step 4: Add service tests**

Create `SparkyFitnessMobile/__tests__/services/mealPlanTemplatesApi.test.ts`:

```ts
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

import { apiFetch } from '../../src/services/api/apiClient';
import {
  fetchActiveMealPlanDay,
  logActiveMealPlanMealToDiary,
} from '../../src/services/api/mealPlanTemplatesApi';

describe('mealPlanTemplatesApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches active meal plan day for a date', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      mode: 'carbCycle',
      date: '2026-07-15',
      meals: [],
    });

    await expect(fetchActiveMealPlanDay('2026-07-15')).resolves.toEqual({
      mode: 'carbCycle',
      date: '2026-07-15',
      meals: [],
    });

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates/active/day?date=2026-07-15',
      serviceName: 'Meal Plan Templates API',
      operation: 'fetch active meal plan day',
    });
  });

  it('logs a planned meal to diary', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      foodEntryMealId: 'entry-meal-1',
    });

    await expect(
      logActiveMealPlanMealToDiary('2026-07-15', 'meal-type-1'),
    ).resolves.toEqual({ foodEntryMealId: 'entry-meal-1' });

    expect(apiFetch).toHaveBeenCalledWith({
      endpoint: '/api/meal-plan-templates/active/log-meal-to-diary',
      serviceName: 'Meal Plan Templates API',
      operation: 'log planned meal to diary',
      method: 'POST',
      body: { date: '2026-07-15', mealTypeId: 'meal-type-1' },
    });
  });
});
```

- [ ] **Step 5: Run tests**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile test -- mealPlanTemplatesApi.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add SparkyFitnessMobile/src/types/mealPlan.ts \
  SparkyFitnessMobile/src/services/api/mealPlanTemplatesApi.ts \
  SparkyFitnessMobile/src/hooks/queryKeys.ts \
  SparkyFitnessMobile/__tests__/services/mealPlanTemplatesApi.test.ts
git commit -m "feat(mobile): add active meal plan api"
```

---

### Task 2: Add Mobile Hooks For Active Planned Day And Log Mutation

**Files:**
- Create: `SparkyFitnessMobile/src/hooks/useActiveMealPlanDay.ts`
- Modify: `SparkyFitnessMobile/src/hooks/index.ts`
- Test: `SparkyFitnessMobile/__tests__/hooks/useActiveMealPlanDay.test.tsx`

- [ ] **Step 1: Create hook**

Create `SparkyFitnessMobile/src/hooks/useActiveMealPlanDay.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  fetchActiveMealPlanDay,
  logActiveMealPlanMealToDiary,
} from '../services/api/mealPlanTemplatesApi';
import {
  activeMealPlanDayQueryKey,
  dailySummaryQueryKey,
} from './queryKeys';

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
    mutationFn: ({
      date,
      mealTypeId,
    }: {
      date: string;
      mealTypeId: string;
    }) => logActiveMealPlanMealToDiary(date, mealTypeId),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: activeMealPlanDayQueryKey(variables.date),
      });
      queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(variables.date),
      });
      Toast.show({
        type: 'success',
        text1: 'Planned meal logged',
      });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Toast.show({
        type: 'error',
        text1: 'Failed to log planned meal',
        text2: message,
      });
    },
  });
}
```

- [ ] **Step 2: Export hook**

Modify `SparkyFitnessMobile/src/hooks/index.ts`:

```ts
export * from './useActiveMealPlanDay';
```

- [ ] **Step 3: Add hook test**

Create `SparkyFitnessMobile/__tests__/hooks/useActiveMealPlanDay.test.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useActiveMealPlanDay } from '../../src/hooks/useActiveMealPlanDay';
import { fetchActiveMealPlanDay } from '../../src/services/api/mealPlanTemplatesApi';

jest.mock('../../src/services/api/mealPlanTemplatesApi', () => ({
  fetchActiveMealPlanDay: jest.fn(),
  logActiveMealPlanMealToDiary: jest.fn(),
}));

const TestComponent = () => {
  const { activeMealPlanDay } = useActiveMealPlanDay({
    date: '2026-07-15',
  });

  return <Text>{activeMealPlanDay?.mode ?? 'loading'}</Text>;
};

describe('useActiveMealPlanDay', () => {
  it('loads active meal plan day', async () => {
    (fetchActiveMealPlanDay as jest.Mock).mockResolvedValueOnce({
      mode: 'carbCycle',
      date: '2026-07-15',
      meals: [],
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const screen = render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('carbCycle')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 4: Run hook test**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile test -- useActiveMealPlanDay.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add SparkyFitnessMobile/src/hooks/useActiveMealPlanDay.ts \
  SparkyFitnessMobile/src/hooks/index.ts \
  SparkyFitnessMobile/__tests__/hooks/useActiveMealPlanDay.test.tsx
git commit -m "feat(mobile): add active meal plan hooks"
```

---

### Task 3: Show Planned Meals And Log From Plan In Diary

**Files:**
- Modify: `SparkyFitnessMobile/src/components/FoodSummary.tsx`
- Modify: `SparkyFitnessMobile/src/screens/DiaryScreen.tsx`
- Modify: `SparkyFitnessMobile/src/screens/MealTypeDetailScreen.tsx`
- Test: `SparkyFitnessMobile/__tests__/components/FoodSummary.plannedMeals.test.tsx`

- [ ] **Step 1: Extend FoodSummary props**

Modify `SparkyFitnessMobile/src/components/FoodSummary.tsx` interfaces:

```ts
import type { ActiveMealPlanDayMeal } from '../types/mealPlan';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  plannedMeals?: ActiveMealPlanDayMeal[];
  isLoggingPlannedMeal?: boolean;
  onLogPlannedMeal?: (meal: ActiveMealPlanDayMeal) => void;
  onAddFood?: () => void;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (mealType: MealTypeKey, entries: FoodEntry[]) => void;
}
```

- [ ] **Step 2: Render planned meal card**

Add a component in `FoodSummary.tsx`:

```tsx
const PlannedMealCard = ({
  meal,
  isLogging,
  onLog,
}: {
  meal: ActiveMealPlanDayMeal;
  isLogging?: boolean;
  onLog?: (meal: ActiveMealPlanDayMeal) => void;
}) => (
  <View className="bg-surface rounded-xl p-4 overflow-hidden shadow-sm border border-accent-primary/20">
    <View className="flex-row items-center gap-2 mb-2">
      <Icon name="calendar" size={18} color="#3B82F6" />
      <Text className="text-base font-bold text-text-secondary flex-1">
        {meal.label}
      </Text>
      <Text className="text-xs text-accent-primary font-semibold">
        {Math.round(meal.target.calories)} Cal
      </Text>
    </View>
    <Text className="text-xs text-text-muted mb-3">
      C {meal.target.carbs}g / P {meal.target.protein}g / F {meal.target.fat}g
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
      disabled={meal.logged || meal.items.length === 0 || !meal.mealTypeId || isLogging}
      onPress={() => onLog?.(meal)}
    >
      {meal.logged ? 'Logged from Plan' : 'Log from Plan'}
    </Button>
  </View>
);
```

- [ ] **Step 3: Render planned meals before logged food entries**

In `FoodSummary.tsx`, before rendering logged meal sections:

```tsx
const plannedMealCards = plannedMeals?.filter((meal) => meal.items.length > 0) ?? [];

return (
  <View className="gap-2 mb-2">
    {plannedMealCards.map((meal) => (
      <PlannedMealCard
        key={meal.key}
        meal={meal}
        isLogging={isLoggingPlannedMeal}
        onLog={onLogPlannedMeal}
      />
    ))}
    {mealTypesWithEntries.map((mealType) => (
      <MealSection
        key={mealType}
        mealType={mealType}
        entries={grouped[mealType]}
        onAdjustServing={onAdjustServing}
        onPressMealType={onPressMealType}
      />
    ))}
    {hasOther && (
      <MealSection
        mealType="other"
        entries={grouped.other}
        onAdjustServing={onAdjustServing}
        onPressMealType={onPressMealType}
      />
    )}
  </View>
);
```

- [ ] **Step 4: Load planned day in DiaryScreen**

Modify `SparkyFitnessMobile/src/screens/DiaryScreen.tsx` imports:

```ts
import {
  useActiveMealPlanDay,
  useLogActiveMealPlanMeal,
} from '../hooks/useActiveMealPlanDay';
import type { ActiveMealPlanDayMeal } from '../types/mealPlan';
```

Inside the component:

```ts
const { activeMealPlanDay, refetch: refetchActiveMealPlanDay } =
  useActiveMealPlanDay({
    date: selectedDate,
    enabled: isConnected,
  });
const logPlannedMealMutation = useLogActiveMealPlanMeal();

const handleLogPlannedMeal = useCallback(
  (meal: ActiveMealPlanDayMeal) => {
    if (!meal.mealTypeId) return;
    logPlannedMealMutation.mutate({
      date: selectedDate,
      mealTypeId: meal.mealTypeId,
    });
  },
  [logPlannedMealMutation, selectedDate],
);
```

Update refresh:

```ts
await Promise.all([refetch(), refetchMeasurements(), refetchActiveMealPlanDay()]);
```

Pass props:

```tsx
<FoodSummary
  foodEntries={summary.foodEntries}
  plannedMeals={
    activeMealPlanDay?.mode === 'carbCycle' ? activeMealPlanDay.meals : []
  }
  isLoggingPlannedMeal={logPlannedMealMutation.isPending}
  onLogPlannedMeal={handleLogPlannedMeal}
  onAddFood={() => navigation.navigate('FoodSearch', { date: selectedDate })}
  onAdjustServing={(entry) => servingSheetRef.current?.present(entry)}
  onPressMealType={openMealTypeDetail}
/>
```

- [ ] **Step 5: Pass planned meal into meal detail route**

Modify `SparkyFitnessMobile/src/types/navigation.ts`:

```ts
import type { ActiveMealPlanDayMeal } from './mealPlan';

MealTypeDetail: {
  date: string;
  mealType: MealTypeKey;
  mealLabel?: string;
  plannedMeal?: ActiveMealPlanDayMeal;
};
```

Modify `openMealTypeDetail` in `DiaryScreen.tsx`:

```ts
const openMealTypeDetail = useCallback(
  (mealType: MealTypeKey) => {
    const plannedMeal = activeMealPlanDay?.meals.find(
      (meal) => meal.mealTypeId === mealType || meal.label.toLowerCase() === mealType.toLowerCase(),
    );
    navigation.navigate('MealTypeDetail', {
      date: selectedDate,
      mealType,
      mealLabel: plannedMeal?.label,
      plannedMeal,
    });
  },
  [activeMealPlanDay?.meals, navigation, selectedDate],
);
```

- [ ] **Step 6: Show planned meal in MealTypeDetailScreen**

Modify `SparkyFitnessMobile/src/screens/MealTypeDetailScreen.tsx`:

```ts
import { useLogActiveMealPlanMeal } from '../hooks/useActiveMealPlanDay';
```

Inside the component:

```ts
const { plannedMeal } = route.params;
const logPlannedMealMutation = useLogActiveMealPlanMeal();
```

Render this before `FoodNutritionSummary`:

```tsx
{plannedMeal && (
  <View className="bg-surface rounded-xl p-4 shadow-sm border border-accent-primary/20">
    <Text className="text-base font-bold text-text-primary">{plannedMeal.label}</Text>
    <Text className="text-xs text-text-muted mt-1">
      Target: {plannedMeal.target.calories} Cal · C {plannedMeal.target.carbs}g · P {plannedMeal.target.protein}g · F {plannedMeal.target.fat}g
    </Text>
    {plannedMeal.items.map((item) => (
      <View key={`${item.type}-${item.id}`} className="flex-row justify-between mt-2">
        <Text className="text-sm text-text-primary flex-1">{item.name}</Text>
        <Text className="text-sm text-text-muted">{item.amountLabel}</Text>
      </View>
    ))}
    <Button
      variant={plannedMeal.logged ? 'secondary' : 'primary'}
      className="mt-4"
      disabled={plannedMeal.logged || !plannedMeal.mealTypeId || plannedMeal.items.length === 0 || logPlannedMealMutation.isPending}
      onPress={() => {
        if (!plannedMeal.mealTypeId) return;
        logPlannedMealMutation.mutate({
          date,
          mealTypeId: plannedMeal.mealTypeId,
        });
      }}
    >
      {plannedMeal.logged ? 'Logged from Plan' : 'Log from Plan'}
    </Button>
  </View>
)}
```

- [ ] **Step 7: Add component test**

Create `SparkyFitnessMobile/__tests__/components/FoodSummary.plannedMeals.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FoodSummary from '../../src/components/FoodSummary';

describe('FoodSummary planned meals', () => {
  it('renders planned meal and logs it', () => {
    const onLog = jest.fn();
    const screen = render(
      <FoodSummary
        foodEntries={[]}
        plannedMeals={[
          {
            key: 'morning',
            mealTypeId: 'meal-type-1',
            label: 'Pre-Workout',
            logged: false,
            target: { calories: 300, carbs: 40, protein: 25, fat: 3 },
            items: [
              {
                id: 'rice',
                type: 'food',
                name: '米饭',
                amountLabel: '120g',
                macroRole: 'carb',
              },
            ],
          },
        ]}
        onLogPlannedMeal={onLog}
      />,
    );

    expect(screen.getByText('Pre-Workout')).toBeTruthy();
    expect(screen.getByText('米饭')).toBeTruthy();

    fireEvent.press(screen.getByText('Log from Plan'));
    expect(onLog).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8: Run tests**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile test -- FoodSummary.plannedMeals.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add SparkyFitnessMobile/src/components/FoodSummary.tsx \
  SparkyFitnessMobile/src/screens/DiaryScreen.tsx \
  SparkyFitnessMobile/src/screens/MealTypeDetailScreen.tsx \
  SparkyFitnessMobile/src/types/navigation.ts \
  SparkyFitnessMobile/__tests__/components/FoodSummary.plannedMeals.test.tsx
git commit -m "feat(mobile): show and log planned meals in diary"
```

---

### Task 4: Add Read-Only Kitchen Screen To APK

**Files:**
- Create: `SparkyFitnessMobile/src/screens/KitchenScreen.tsx`
- Modify: `SparkyFitnessMobile/src/types/navigation.ts`
- Modify: `SparkyFitnessMobile/App.tsx`
- Modify: `SparkyFitnessMobile/src/screens/LibraryScreen.tsx`
- Test: `SparkyFitnessMobile/__tests__/screens/KitchenScreen.test.tsx`

- [ ] **Step 1: Add route type**

Modify `SparkyFitnessMobile/src/types/navigation.ts`:

```ts
Kitchen: undefined;
```

Add this key inside `RootStackParamList`.

- [ ] **Step 2: Create Kitchen screen**

Create `SparkyFitnessMobile/src/screens/KitchenScreen.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import DateNavigator from '../components/DateNavigator';
import StatusView from '../components/StatusView';
import { useActiveMealPlanDay } from '../hooks/useActiveMealPlanDay';
import { addDays, getTodayDate } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type KitchenScreenProps = RootStackScreenProps<'Kitchen'>;

const KitchenScreen: React.FC<KitchenScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const { activeMealPlanDay, isLoading, isError, refetch } = useActiveMealPlanDay({
    date: selectedDate,
  });

  const totals = useMemo(() => {
    const meals = activeMealPlanDay?.meals ?? [];
    return meals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.target.calories,
        carbs: sum.carbs + meal.target.carbs,
        protein: sum.protein + meal.target.protein,
        fat: sum.fat + meal.target.fat,
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 },
    );
  }, [activeMealPlanDay?.meals]);

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

  const meals = activeMealPlanDay?.mode === 'carbCycle' ? activeMealPlanDay.meals : [];

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
                {Math.round(totals.calories)} Cal · C {Math.round(totals.carbs)}g · P {Math.round(totals.protein)}g · F {Math.round(totals.fat)}g
              </Text>
            </View>
            {meals.map((meal) => (
              <View key={meal.key} className="bg-surface rounded-xl p-4 shadow-sm">
                <Text className="text-text-primary font-bold">{meal.label}</Text>
                <Text className="text-text-muted text-xs mt-1">
                  C {meal.target.carbs}g · P {meal.target.protein}g · F {meal.target.fat}g
                </Text>
                {meal.items.map((item) => (
                  <View key={`${item.type}-${item.id}`} className="flex-row justify-between mt-3">
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
```

- [ ] **Step 3: Register route in App**

Modify `SparkyFitnessMobile/App.tsx`:

```ts
import KitchenScreen from './src/screens/KitchenScreen';
const SafeKitchen = withErrorBoundary(KitchenScreen, 'Kitchen', { canGoBack: true });
```

Register stack screen with the same pattern as other safe screens:

```tsx
<Stack.Screen
  name="Kitchen"
  component={SafeKitchen}
  options={{ title: 'Kitchen' }}
/>
```

- [ ] **Step 4: Add entry in Library**

In `SparkyFitnessMobile/src/screens/LibraryScreen.tsx`, add a row/button:

```tsx
<Pressable
  onPress={() => navigation.navigate('Kitchen')}
  className="bg-surface rounded-xl p-4 flex-row items-center"
>
  <Text className="text-text-primary font-semibold flex-1">Kitchen</Text>
  <Icon name="chevron-forward" size={18} color="#9CA3AF" />
</Pressable>
```

- [ ] **Step 5: Add screen test**

Create `SparkyFitnessMobile/__tests__/screens/KitchenScreen.test.tsx`:

```tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import KitchenScreen from '../../src/screens/KitchenScreen';
import { useActiveMealPlanDay } from '../../src/hooks/useActiveMealPlanDay';

jest.mock('../../src/hooks/useActiveMealPlanDay', () => ({
  useActiveMealPlanDay: jest.fn(),
}));

describe('KitchenScreen', () => {
  it('renders planned meals', async () => {
    (useActiveMealPlanDay as jest.Mock).mockReturnValue({
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      activeMealPlanDay: {
        mode: 'carbCycle',
        date: '2026-07-15',
        planName: 'Weekly Carb Cycle',
        meals: [
          {
            key: 'morning',
            mealTypeId: 'meal-type-1',
            label: 'Breakfast',
            logged: false,
            target: { calories: 300, carbs: 30, protein: 25, fat: 8 },
            items: [{ id: 'egg', type: 'food', name: '鸡蛋', amountLabel: '2 个' }],
          },
        ],
      },
    });

    const screen = render(<KitchenScreen navigation={{} as never} route={{} as never} />);

    await waitFor(() => {
      expect(screen.getByText('Weekly Carb Cycle')).toBeTruthy();
      expect(screen.getByText('Breakfast')).toBeTruthy();
      expect(screen.getByText('鸡蛋')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 6: Run tests**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile test -- KitchenScreen.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add SparkyFitnessMobile/src/screens/KitchenScreen.tsx \
  SparkyFitnessMobile/src/types/navigation.ts \
  SparkyFitnessMobile/App.tsx \
  SparkyFitnessMobile/src/screens/LibraryScreen.tsx \
  SparkyFitnessMobile/__tests__/screens/KitchenScreen.test.tsx
git commit -m "feat(mobile): add kitchen meal plan preview"
```

---

### Task 5: Later Phase - Mobile Plan Creation And Editing

**Files:**
- Create: `SparkyFitnessMobile/src/screens/TrainingFocusPlanScreen.tsx`
- Create: `SparkyFitnessMobile/src/screens/CarbCycleMealPlanScreen.tsx`
- Create: `SparkyFitnessMobile/src/services/api/workoutPlanTemplatesApi.ts`
- Extend: `SparkyFitnessMobile/src/services/api/mealPlanTemplatesApi.ts`
- Modify: `SparkyFitnessMobile/src/types/navigation.ts`
- Modify: `SparkyFitnessMobile/App.tsx`

- [ ] **Step 1: Defer this phase until Tasks 1-4 are deployed and tested**

Do not start mobile creation/editing until the daily Diary and Kitchen workflows have been used for at least one week. The Web UI is still the best surface for weekly planning.

- [ ] **Step 2: Create a separate plan before implementation**

Before implementation, write a new plan at:

```text
docs/superpowers/plans/YYYY-MM-DD-mobile-carb-cycle-editing.md
```

That plan must include:

- Training Focus Plan creation and editing.
- Per-day sessions and one primary training slot per day.
- Carb-cycle target generation using current body weight from server check-ins.
- Per-meal macro-role food selection.
- Save and activate flow.

---

## Validation Commands

Run these after each implementation batch:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile typecheck
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile lint
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile test -- --runInBand
```

If full test suite is slow or unstable, at minimum run the task-specific tests plus:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm@10.33.4 --dir SparkyFitnessMobile typecheck
```

## Release Strategy

- Use small commits per task.
- Tag only after Tasks 1-4 are complete and APK validation passes.
- Suggested tag after first APK feature parity release: `v0.17.3-eric.24`.
- Do not tag Task 5 together with Tasks 1-4; editing flows are a separate release.

## Self-Review

- Spec coverage: The plan covers APK consumption of active carb-cycle meal plans, logging planned meals, and read-only Kitchen. It intentionally defers mobile creation/editing.
- Placeholder scan: No implementation steps depend on undefined server APIs; all APIs referenced already exist on the server from the Web work.
- Type consistency: `ActiveMealPlanDay`, `ActiveMealPlanDayMeal`, and `PlannedMealItem` are introduced once and reused by hooks, Diary, Meal detail, and Kitchen.
