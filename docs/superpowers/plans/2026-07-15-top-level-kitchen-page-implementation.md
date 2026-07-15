# Top-Level Kitchen Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level read-only Kitchen page that previews the active carb-cycle meal plan by calendar weekday, meal, food, and amount.

**Architecture:** The first implementation is frontend-first and derives a Kitchen view model from the existing `useMealPlanTemplates(activeUserId)` data. It adds a `/kitchen` route and navigation entry, then renders active plan data without writing to Diary or changing backend behavior.

**Tech Stack:** React, TypeScript, React Router, TanStack Query, Jest, Testing Library, existing SparkyFitness UI components.

---

## File Structure

- Create `SparkyFitnessFrontend/src/pages/Kitchen/kitchenPlanUtils.ts`
  - Pure helpers for active template selection, Monday-Sunday day model creation, target/assignment grouping, formatting, and empty-state derivation.
- Create `SparkyFitnessFrontend/src/pages/Kitchen/Kitchen.tsx`
  - Page component that loads active user meal plans and renders the Kitchen preview.
- Create `SparkyFitnessFrontend/src/tests/utils/kitchenPlanUtils.test.ts`
  - Unit tests for date mapping and view-model derivation.
- Create `SparkyFitnessFrontend/src/tests/components/Kitchen.test.tsx`
  - Component tests for empty state, date tabs, today marker, and food quantity display.
- Modify `SparkyFitnessFrontend/src/App.tsx`
  - Lazy-load Kitchen page and add `/kitchen` route.
- Modify `SparkyFitnessFrontend/src/layouts/MainLayout.tsx`
  - Add Kitchen to desktop and mobile navigation.

---

### Task 1: Kitchen View-Model Utilities

**Files:**
- Create: `SparkyFitnessFrontend/src/pages/Kitchen/kitchenPlanUtils.ts`
- Test: `SparkyFitnessFrontend/src/tests/utils/kitchenPlanUtils.test.ts`

- [ ] **Step 1: Write failing utility tests**

Create `SparkyFitnessFrontend/src/tests/utils/kitchenPlanUtils.test.ts`:

```ts
import {
  buildKitchenWeek,
  getActiveKitchenTemplate,
  type KitchenPlanTemplate,
} from '@/pages/Kitchen/kitchenPlanUtils';

const template = (
  overrides: Partial<KitchenPlanTemplate> = {}
): KitchenPlanTemplate => ({
  id: 'plan-1',
  plan_name: 'Eric carb cycle',
  start_date: '2026-07-14',
  end_date: null,
  is_active: true,
  macro_targets: {
    1: [
      {
        slotKey: 'morning',
        label: 'Breakfast',
        carbs: 28,
        protein: 40,
        fat: 30,
        calories: 542,
      },
    ],
    2: [
      {
        slotKey: 'morning',
        label: 'Pre-Workout',
        carbs: 39.2,
        protein: 30,
        fat: 0,
        calories: 277,
      },
    ],
  },
  assignments: [
    {
      item_type: 'food',
      day_of_week: 2,
      meal_type: 'Pre-Workout',
      food_id: 'rice',
      food_name: '米饭',
      quantity: 150,
      unit: 'g',
      macro_role: 'carb',
    },
  ],
  ...overrides,
});

describe('kitchenPlanUtils', () => {
  it('selects the latest active template whose date range contains today', () => {
    const active = getActiveKitchenTemplate(
      [
        template({ id: 'old', start_date: '2026-07-01' }),
        template({ id: 'latest', start_date: '2026-07-10' }),
        template({ id: 'inactive', is_active: false, start_date: '2026-07-20' }),
      ],
      '2026-07-15'
    );

    expect(active?.id).toBe('latest');
  });

  it('maps weekday targets by calendar weekday, not start-date offset', () => {
    const week = buildKitchenWeek(template(), '2026-07-14', '2026-07-15');

    expect(week.days.map((day) => day.weekdayLabel)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(week.days[0].date).toBe('2026-07-13');
    expect(week.days[0].meals[0]?.label).toBe('Breakfast');
    expect(week.days[1].meals[0]?.label).toBe('Pre-Workout');
    expect(week.days[1].meals[0]?.items[0]?.name).toBe('米饭');
    expect(week.days[1].meals[0]?.items[0]?.amountLabel).toBe('150g');
  });

  it('marks today separately from the selected date', () => {
    const week = buildKitchenWeek(template(), '2026-07-16', '2026-07-15');

    expect(week.selectedDate).toBe('2026-07-16');
    expect(week.todayDate).toBe('2026-07-15');
    expect(week.days.find((day) => day.isSelected)?.date).toBe('2026-07-16');
    expect(week.days.find((day) => day.isToday)?.date).toBe('2026-07-15');
  });
});
```

- [ ] **Step 2: Run utility tests and verify failure**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/utils/kitchenPlanUtils.test.ts --runInBand
```

Expected: fail because `@/pages/Kitchen/kitchenPlanUtils` does not exist.

- [ ] **Step 3: Implement kitchen view-model utilities**

Create `SparkyFitnessFrontend/src/pages/Kitchen/kitchenPlanUtils.ts`:

```ts
import type { MealPlanTemplate, MealPlanTemplateAssignment } from '@/types/meal';
import type { CarbCycleMealTarget } from '@/types/goals';

export type KitchenPlanTemplate = Omit<MealPlanTemplate, 'end_date'> & {
  end_date?: string | null;
};

export interface KitchenPlannedItem {
  id: string;
  type: 'food' | 'meal';
  name: string;
  quantity: number;
  unit: string;
  amountLabel: string;
  macroRole?: MealPlanTemplateAssignment['macro_role'];
}

export interface KitchenMealPreview {
  key: string;
  label: string;
  target: CarbCycleMealTarget;
  items: KitchenPlannedItem[];
}

export interface KitchenDayPreview {
  dayIndex: number;
  date: string;
  weekdayLabel: string;
  shortLabel: string;
  dayNumberLabel: string;
  isToday: boolean;
  isSelected: boolean;
  dayTypeLabel: string;
  targetCalories: number;
  targetCarbs: number;
  targetProtein: number;
  targetFat: number;
  meals: KitchenMealPreview[];
}

export interface KitchenWeekPreview {
  template: KitchenPlanTemplate;
  selectedDate: string;
  todayDate: string;
  days: KitchenDayPreview[];
}

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function parseDay(date: string): Date {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mondayFor(date: string): Date {
  const parsed = parseDay(date);
  const day = parsed.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(parsed, -daysSinceMonday);
}

function normalizeTargets(
  targets: KitchenPlanTemplate['macro_targets']
): Record<number, CarbCycleMealTarget[]> {
  if (!targets) return {};
  return Object.entries(targets).reduce<Record<number, CarbCycleMealTarget[]>>(
    (acc, [key, value]) => {
      acc[Number(key)] = Array.isArray(value) ? value : [];
      return acc;
    },
    {}
  );
}

function formatAmount(quantity: number | undefined, unit: string | undefined) {
  const resolvedQuantity = quantity ?? 1;
  const resolvedUnit = unit ?? 'serving';
  const amount =
    Number.isInteger(resolvedQuantity) ? resolvedQuantity : Number(resolvedQuantity.toFixed(1));
  return `${amount}${resolvedUnit}`;
}

function itemFromAssignment(
  assignment: MealPlanTemplateAssignment
): KitchenPlannedItem {
  const quantity = assignment.quantity ?? 1;
  const unit = assignment.unit ?? 'serving';
  return {
    id:
      assignment.item_type === 'meal'
        ? (assignment.meal_id ?? `${assignment.day_of_week}-${assignment.meal_type}-meal`)
        : (assignment.food_id ?? `${assignment.day_of_week}-${assignment.meal_type}-food`),
    type: assignment.item_type,
    name:
      assignment.item_type === 'meal'
        ? (assignment.meal_name ?? 'Meal')
        : (assignment.food_name ?? 'Food'),
    quantity,
    unit,
    amountLabel: formatAmount(quantity, unit),
    macroRole: assignment.macro_role,
  };
}

export function getActiveKitchenTemplate(
  templates: KitchenPlanTemplate[] | undefined,
  todayDate: string
): KitchenPlanTemplate | null {
  const today = parseDay(todayDate);
  const candidates = (templates ?? []).filter((template) => {
    if (!template.is_active) return false;
    const start = parseDay(template.start_date);
    const end = template.end_date ? parseDay(template.end_date) : null;
    return start <= today && (!end || end >= today);
  });

  return (
    candidates.sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ??
    null
  );
}

export function buildKitchenWeek(
  template: KitchenPlanTemplate,
  selectedDate: string,
  todayDate: string
): KitchenWeekPreview {
  const monday = mondayFor(selectedDate);
  const targetsByDay = normalizeTargets(template.macro_targets);

  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(monday, offset);
    const dateString = formatDay(date);
    const dayIndex = date.getUTCDay();
    const meals = targetsByDay[dayIndex] ?? [];
    const assignments = (template.assignments ?? []).filter(
      (assignment) => assignment.day_of_week === dayIndex
    );

    const previewMeals = meals.map((target) => {
      const targetAssignments = assignments.filter(
        (assignment) =>
          assignment.meal_type.toLowerCase() === target.label.toLowerCase()
      );

      return {
        key: `${dayIndex}-${target.slotKey}-${target.label}`,
        label: target.label,
        target,
        items: targetAssignments.map(itemFromAssignment),
      };
    });

    const totals = meals.reduce(
      (sum, target) => ({
        calories: sum.calories + target.calories,
        carbs: sum.carbs + target.carbs,
        protein: sum.protein + target.protein,
        fat: sum.fat + target.fat,
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 }
    );

    return {
      dayIndex,
      date: dateString,
      weekdayLabel: WEEKDAY_LABELS[dayIndex],
      shortLabel: WEEKDAY_LABELS[dayIndex].slice(0, 3),
      dayNumberLabel: String(date.getUTCDate()).padStart(2, '0'),
      isToday: dateString === todayDate,
      isSelected: dateString === selectedDate,
      dayTypeLabel: resolveDayTypeLabel(meals),
      targetCalories: totals.calories,
      targetCarbs: totals.carbs,
      targetProtein: totals.protein,
      targetFat: totals.fat,
      meals: previewMeals,
    };
  });

  return { template, selectedDate, todayDate, days };
}

export function resolveDayTypeLabel(meals: CarbCycleMealTarget[]) {
  const carbs = meals.reduce((sum, meal) => sum + meal.carbs, 0);
  const fat = meals.reduce((sum, meal) => sum + meal.fat, 0);
  if (carbs >= 220) return 'High Carb';
  if (fat >= 90) return 'Low Carb';
  return 'Medium Carb';
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 4: Run utility tests and verify pass**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/utils/kitchenPlanUtils.test.ts --runInBand
```

Expected: all tests pass.

---

### Task 2: Kitchen Page Component

**Files:**
- Create: `SparkyFitnessFrontend/src/pages/Kitchen/Kitchen.tsx`
- Test: `SparkyFitnessFrontend/src/tests/components/Kitchen.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `SparkyFitnessFrontend/src/tests/components/Kitchen.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Kitchen from '@/pages/Kitchen/Kitchen';
import { renderWithClient } from '@/tests/test-utils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'debug' }),
}));

const mockGetMealPlanTemplates = jest.fn();
jest.mock('@/api/Foods/mealPlanTemplate', () => ({
  getMealPlanTemplates: (...args: unknown[]) =>
    mockGetMealPlanTemplates(...args),
}));

describe('Kitchen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an empty state when no active meal plan exists', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([]);

    renderWithClient(<Kitchen />);

    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('No active meal plan')).toBeInTheDocument();
    });
    expect(screen.getByText(/Create or activate a Meal Plan/i)).toBeInTheDocument();
  });

  it('renders weekday tabs, targets, and planned food amounts', async () => {
    mockGetMealPlanTemplates.mockResolvedValue([
      {
        id: 'plan-1',
        plan_name: 'Eric carb cycle',
        start_date: '2026-07-14',
        end_date: null,
        is_active: true,
        macro_targets: {
          1: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              carbs: 28,
              protein: 40,
              fat: 30,
              calories: 542,
            },
          ],
          2: [
            {
              slotKey: 'morning',
              label: 'Pre-Workout',
              carbs: 39.2,
              protein: 30,
              fat: 0,
              calories: 277,
            },
          ],
        },
        assignments: [
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type: 'Pre-Workout',
            food_id: 'rice',
            food_name: '米饭',
            quantity: 150,
            unit: 'g',
            macro_role: 'carb',
          },
        ],
      },
    ]);

    renderWithClient(<Kitchen todayOverride="2026-07-15" />);

    expect(await screen.findByText('Eric carb cycle')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Mon/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Tue/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Tue/i }));

    expect(screen.getByText('Pre-Workout')).toBeInTheDocument();
    expect(screen.getByText('米饭')).toBeInTheDocument();
    expect(screen.getByText('150g')).toBeInTheDocument();
    expect(screen.getByText(/C 39.2g/i)).toBeInTheDocument();
    expect(screen.getByText(/P 30g/i)).toBeInTheDocument();
    expect(screen.getByText(/F 0g/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/components/Kitchen.test.tsx --runInBand
```

Expected: fail because `@/pages/Kitchen/Kitchen` does not exist.

- [ ] **Step 3: Implement the Kitchen page**

Create `SparkyFitnessFrontend/src/pages/Kitchen/Kitchen.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, CalendarDays, Utensils } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useMealPlanTemplates } from '@/hooks/Foods/useMealplanTemplate';
import {
  buildKitchenWeek,
  getActiveKitchenTemplate,
  localDateString,
  type KitchenPlanTemplate,
} from './kitchenPlanUtils';
import { cn } from '@/lib/utils';

interface KitchenProps {
  todayOverride?: string;
}

function grams(value: number) {
  return `${Number(value.toFixed(1)).toString()}g`;
}

export default function Kitchen({ todayOverride }: KitchenProps) {
  const { activeUserId } = useActiveUser();
  const todayDate = todayOverride ?? localDateString();
  const { data: templates, isLoading, error } =
    useMealPlanTemplates(activeUserId);
  const activeTemplate = getActiveKitchenTemplate(
    templates as KitchenPlanTemplate[] | undefined,
    todayDate
  );
  const [selectedDate, setSelectedDate] = useState(todayDate);

  const week = useMemo(() => {
    if (!activeTemplate) return null;
    return buildKitchenWeek(activeTemplate, selectedDate, todayDate);
  }, [activeTemplate, selectedDate, todayDate]);

  const selectedDay = week?.days.find((day) => day.isSelected) ?? week?.days[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Meal Plan Preview
          </p>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ChefHat className="h-7 w-7 text-primary" />
            Kitchen
          </h2>
        </div>
        {activeTemplate ? (
          <Badge variant="secondary" className="w-fit">
            Active Plan: {activeTemplate.plan_name}
          </Badge>
        ) : null}
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Loading kitchen preview...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Failed to load Kitchen preview.
          </CardContent>
        </Card>
      ) : !week || !selectedDay ? (
        <Card>
          <CardHeader>
            <CardTitle>No active meal plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create or activate a Meal Plan before using Kitchen preview.
            </p>
            <Button asChild>
              <Link to="/foods">Open Foods</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Kitchen week days"
          >
            {week.days.map((day) => (
              <button
                key={day.date}
                type="button"
                role="tab"
                aria-selected={day.isSelected}
                aria-current={day.isToday ? 'date' : undefined}
                className={cn(
                  'min-w-[92px] rounded-xl border px-3 py-3 text-center transition-colors',
                  day.isSelected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card hover:border-primary/60',
                  day.isToday &&
                    !day.isSelected &&
                    'border-yellow-400 shadow-[inset_0_0_0_1px_rgb(250,204,21)]'
                )}
                onClick={() => setSelectedDate(day.date)}
              >
                <div className="text-xs uppercase opacity-80">
                  {day.shortLabel}
                </div>
                <div className="text-2xl font-bold leading-tight">
                  {day.dayNumberLabel}
                </div>
                <div className="text-[10px] uppercase opacity-80">
                  {day.dayTypeLabel}
                </div>
              </button>
            ))}
          </div>

          <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  {selectedDay.weekdayLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Badge>{selectedDay.dayTypeLabel}</Badge>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MacroBox label="Calories" value={`${selectedDay.targetCalories} kcal`} />
                  <MacroBox label="Carbs" value={grams(selectedDay.targetCarbs)} />
                  <MacroBox label="Protein" value={grams(selectedDay.targetProtein)} />
                  <MacroBox label="Fat" value={grams(selectedDay.targetFat)} />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {selectedDay.meals.length === 0 ? (
                <Card className="md:col-span-2">
                  <CardContent className="py-10 text-center text-muted-foreground">
                    No meal targets configured for this day.
                  </CardContent>
                </Card>
              ) : (
                selectedDay.meals.map((meal) => (
                  <Card key={meal.key}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3 text-lg">
                        <span>{meal.label}</span>
                        <Utensils className="h-5 w-5 text-muted-foreground" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        {meal.items.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No planned foods selected.
                          </p>
                        ) : (
                          meal.items.map((item) => (
                            <div
                              key={`${meal.key}-${item.type}-${item.id}`}
                              className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2"
                            >
                              <span className="font-medium">{item.name}</span>
                              <span className="font-mono text-sm">
                                {item.amountLabel}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 border-t pt-3 text-xs text-muted-foreground">
                        <span>C {grams(meal.target.carbs)}</span>
                        <span>P {grams(meal.target.protein)}</span>
                        <span>F {grams(meal.target.fat)}</span>
                        <span>{meal.target.calories} kcal</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MacroBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run component tests and verify pass**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/components/Kitchen.test.tsx --runInBand
```

Expected: all tests pass.

---

### Task 3: Route And Navigation

**Files:**
- Modify: `SparkyFitnessFrontend/src/App.tsx`
- Modify: `SparkyFitnessFrontend/src/layouts/MainLayout.tsx`
- Test: `SparkyFitnessFrontend/src/tests/components/MainLayout.kitchen.test.tsx`

- [ ] **Step 1: Write failing navigation test**

Create `SparkyFitnessFrontend/src/tests/components/MainLayout.kitchen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { renderWithClient } from '@/tests/test-utils';
import MainLayout from '@/layouts/MainLayout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: 'user' },
    signOut: jest.fn(),
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    isActingOnBehalf: false,
    hasPermission: () => true,
    hasWritePermission: () => true,
    activeUserName: 'Eric',
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'debug',
    getDateRelationToToday: () => 'today',
  }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({ data: [] }),
}));

jest.mock('@/hooks/useCycle', () => ({
  useCycleSettings: () => ({ data: { enabled: false } }),
}));

jest.mock('@/hooks/useGeneralQueries', () => ({
  useCurrentVersionQuery: () => ({ data: { version: '0.17.3-eric' } }),
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/components/ProfileSwitcher', () => () => null);
jest.mock('@/components/GlobalSyncButton', () => () => null);
jest.mock('@/components/ThemeToggle', () => () => null);
jest.mock('@/components/GlobalNotificationIcon', () => () => null);
jest.mock('@/components/GitHubStarCounter', () => () => null);
jest.mock('@/components/GitHubSponsorButton', () => () => null);
jest.mock('@/pages/Chat/SparkyChat', () => () => null);
jest.mock('@/layouts/AddComp', () => () => null);

describe('MainLayout Kitchen navigation', () => {
  it('shows Kitchen as a top-level desktop navigation item', () => {
    renderWithClient(
      <MemoryRouter initialEntries={['/kitchen']}>
        <MainLayout
          onShowAboutDialog={jest.fn()}
          onShowNewReleaseDialog={jest.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Kitchen/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run navigation test and verify failure**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/components/MainLayout.kitchen.test.tsx --runInBand
```

Expected: fail because Kitchen is not in `availableTabs`.

- [ ] **Step 3: Add Kitchen route**

Modify `SparkyFitnessFrontend/src/App.tsx`:

```ts
const Kitchen = lazyWithChunkRecovery(() => import('./pages/Kitchen/Kitchen'));
```

Add route under the authenticated root children:

```tsx
{
  path: 'kitchen',
  Component: Kitchen,
  ErrorBoundary: RouteErrorBoundary,
},
```

- [ ] **Step 4: Add Kitchen navigation**

Modify `SparkyFitnessFrontend/src/layouts/MainLayout.tsx`:

```ts
import {
  Home,
  Activity,
  CalendarHeart,
  BarChart3,
  Utensils,
  ChefHat,
  Settings as SettingsIcon,
  LogOut,
  Dumbbell,
  Target,
  Pill,
  Shield,
  Plus,
  X,
  Coffee,
  Sandwich,
  Cookie,
  UtensilsCrossed,
  Salad,
} from 'lucide-react';
```

Add desktop tab immediately after Diary:

```ts
tabs.push(
  { value: '/', label: t('nav.diary'), icon: Home },
  { value: '/kitchen', label: t('nav.kitchen', 'Kitchen'), icon: ChefHat },
  { value: '/checkin', label: t('nav.checkin'), icon: Activity }
);
```

Add mobile tab immediately after Diary:

```ts
mobileTabs.push(
  { value: '/', label: t('nav.diary'), icon: Home },
  { value: '/kitchen', label: t('nav.kitchen', 'Kitchen'), icon: ChefHat },
  { value: '/reports', label: t('nav.reports'), icon: BarChart3 },
  {
    value: 'Add',
    label: t('common.add', 'Add'),
    icon: isAddCompOpen ? X : Plus,
  },
  { value: '/settings', label: t('nav.settings'), icon: SettingsIcon }
);
```

For delegate profiles with diary write permission, include Kitchen next to Diary:

```ts
if (hasWritePermission('diary')) {
  tabs.push({ value: '/', label: t('nav.diary'), icon: Home });
  tabs.push({ value: '/kitchen', label: t('nav.kitchen', 'Kitchen'), icon: ChefHat });
}
```

Mirror the same addition in mobile delegate tabs.

- [ ] **Step 5: Run navigation test and verify pass**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/components/MainLayout.kitchen.test.tsx --runInBand
```

Expected: all tests pass.

---

### Task 4: Final Verification

**Files:**
- All files touched by Tasks 1-3.

- [ ] **Step 1: Run focused Kitchen tests**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/utils/kitchenPlanUtils.test.ts src/tests/components/Kitchen.test.tsx src/tests/components/MainLayout.kitchen.test.tsx --runInBand
```

Expected: all Kitchen-focused tests pass.

- [ ] **Step 2: Run related Meal Plan tests**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend test -- src/tests/components/MealPlanTemplateForm.carbCycle.test.tsx src/tests/components/MealPlanCalendar.test.tsx --runInBand
```

Expected: all related tests pass.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
COREPACK_HOME=/tmp/corepack corepack pnpm --filter sparkyfitnessfrontend typecheck
```

Expected: `tsc -b` exits with code 0.

- [ ] **Step 4: Run diff check**

Run from repository root:

```bash
git -C external/SparkyFitness diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit**

Run from repository root:

```bash
git -C external/SparkyFitness status --short
git -C external/SparkyFitness add \
  SparkyFitnessFrontend/src/App.tsx \
  SparkyFitnessFrontend/src/layouts/MainLayout.tsx \
  SparkyFitnessFrontend/src/pages/Kitchen/Kitchen.tsx \
  SparkyFitnessFrontend/src/pages/Kitchen/kitchenPlanUtils.ts \
  SparkyFitnessFrontend/src/tests/components/Kitchen.test.tsx \
  SparkyFitnessFrontend/src/tests/components/MainLayout.kitchen.test.tsx \
  SparkyFitnessFrontend/src/tests/utils/kitchenPlanUtils.test.ts
git -C external/SparkyFitness commit -m "feat: add top-level kitchen preview"
```

Expected: commit succeeds and working tree is clean.

---

## Self-Review

Spec coverage:

- Top-level `/kitchen` route: Task 3.
- Desktop and mobile navigation: Task 3.
- Read-only active meal plan preview: Task 2.
- Existing meal plan template data source: Task 1 and Task 2.
- Monday-Sunday weekday mapping independent of `start_date`: Task 1.
- Empty and error states: Task 2.
- No Diary writes: Task 2 only reads `useMealPlanTemplates`.
- Tests for utility, component, route/nav, and related regressions: Tasks 1-4.

Placeholder scan:

- No placeholder or unspecified implementation steps remain.

Type consistency:

- `KitchenPlanTemplate`, `KitchenWeekPreview`, `KitchenDayPreview`, and
  `KitchenMealPreview` are defined in Task 1 and consumed in Task 2.
- Route path and nav value both use `/kitchen`.
