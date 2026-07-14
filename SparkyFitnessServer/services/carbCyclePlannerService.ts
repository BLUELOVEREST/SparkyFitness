export type CarbCycleDayType = 'low' | 'medium' | 'high';
export type CarbCycleTrainingSlot =
  | 'rest'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'evening';

export type CarbCycleSlotKey = Exclude<CarbCycleTrainingSlot, 'rest'>;

export type CarbCycleTemplate = readonly [
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
];

export type CarbCycleTrainingTemplate = readonly [
  CarbCycleTrainingSlot,
  CarbCycleTrainingSlot,
  CarbCycleTrainingSlot,
  CarbCycleTrainingSlot,
  CarbCycleTrainingSlot,
  CarbCycleTrainingSlot,
  CarbCycleTrainingSlot,
];

export interface CarbCycleTrainingSession {
  day_of_week?: number;
  time_slot: CarbCycleSlotKey;
  training_focus: string;
  is_primary: boolean;
}

export interface CalculateCarbCycleWeekInput {
  weekStartDate: string;
  bodyWeightKg: number;
  carbsPerKg: number;
  proteinPerKg: number;
  fatPerKg: number;
  template?: CarbCycleTemplate;
  trainingSlots?: CarbCycleTrainingTemplate;
  trainingSessionsByDay?: CarbCycleTrainingSession[][];
}

export interface CarbCycleMealTarget {
  slotKey: CarbCycleSlotKey;
  label: string;
  carbs: number;
  protein: number;
  fat: number;
  calories: number;
}

export interface CarbCycleDayPlan {
  date: string;
  dayType: CarbCycleDayType;
  carbs: number;
  protein: number;
  fat: number;
  calories: number;
  trainingSlot: CarbCycleTrainingSlot;
  trainingSessions?: CarbCycleTrainingSession[];
  meals: CarbCycleMealTarget[];
}

export interface CarbCycleWeekTotals {
  carbs: number;
  protein: number;
  fat: number;
  calories: number;
}

export interface CarbCycleWeekPlan {
  weekStartDate: string;
  template: CarbCycleTemplate;
  days: CarbCycleDayPlan[];
  weekTotals: CarbCycleWeekTotals;
}

export const DEFAULT_CARB_CYCLE_TEMPLATE: CarbCycleTemplate = [
  'low',
  'medium',
  'medium',
  'high',
  'low',
  'high',
  'medium',
];

const CARB_DISTRIBUTION: Record<CarbCycleDayType, number> = {
  high: 0.5,
  medium: 0.35,
  low: 0.15,
};

const FAT_DISTRIBUTION: Record<CarbCycleDayType, number> = {
  high: 0.15,
  medium: 0.35,
  low: 0.5,
};

const SLOT_KEYS: readonly CarbCycleSlotKey[] = [
  'morning',
  'noon',
  'afternoon',
  'evening',
];

const DEFAULT_MEAL_LABELS: Record<CarbCycleSlotKey, string> = {
  morning: 'Breakfast',
  noon: 'Lunch',
  afternoon: 'Afternoon Meal',
  evening: 'Dinner',
};

const PRIMARY_SLOT_MEAL_LABELS: Record<
  CarbCycleSlotKey,
  readonly [string, string, string, string]
> = {
  morning: ['Pre-Workout', 'Post-Workout', 'Lunch', 'Dinner'],
  noon: ['Breakfast', 'Pre-Workout', 'Post-Workout', 'Dinner'],
  afternoon: ['Breakfast', 'Lunch', 'Pre-Workout', 'Post-Workout'],
  evening: ['Breakfast', 'Lunch', 'Pre-Workout', 'Post-Workout'],
};

function assertPositive(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0`);
  }
}

function parseWeekStartDate(weekStartDate: string): Date {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(weekStartDate)) {
    throw new Error('weekStartDate must be a valid date');
  }

  const parsedDate = new Date(`${weekStartDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('weekStartDate must be a valid date');
  }

  if (formatDate(parsedDate) !== weekStartDate) {
    throw new Error('weekStartDate must be a valid date');
  }

  return parsedDate;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function roundMacro(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMealMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

function countTemplateDays(
  template: CarbCycleTemplate
): Record<CarbCycleDayType, number> {
  return template.reduce<Record<CarbCycleDayType, number>>(
    (counts, dayType) => {
      counts[dayType] += 1;
      return counts;
    },
    { low: 0, medium: 0, high: 0 }
  );
}

function resolveMealLabels(
  trainingSlot: CarbCycleTrainingSlot
): Record<CarbCycleSlotKey, string> {
  if (trainingSlot === 'rest') {
    return { ...DEFAULT_MEAL_LABELS };
  }

  const labels = PRIMARY_SLOT_MEAL_LABELS[trainingSlot];
  return {
    morning: labels[0],
    noon: labels[1],
    afternoon: labels[2],
    evening: labels[3],
  };
}

function distributeByPercent(total: number, percentages: readonly number[]) {
  const rounded = percentages.map((percentage) =>
    roundMealMacro(total * percentage)
  );
  const diff = roundMealMacro(
    total - rounded.reduce((sum, value) => sum + value, 0)
  );
  if (rounded.length > 0) {
    rounded[rounded.length - 1] = roundMealMacro(
      rounded[rounded.length - 1] + diff
    );
  }
  return rounded;
}

function buildMealTargets(
  totals: Pick<CarbCycleDayPlan, 'carbs' | 'protein' | 'fat'>,
  trainingSlot: CarbCycleTrainingSlot
): CarbCycleMealTarget[] {
  const labelMap = resolveMealLabels(trainingSlot);
  const mealSlotKeys: readonly CarbCycleSlotKey[] =
    trainingSlot === 'rest' ? ['morning', 'noon', 'evening'] : SLOT_KEYS;
  let carbPercentages = [0.25, 0.25, 0.25, 0.25];
  let proteinPercentages = [0.25, 0.25, 0.25, 0.25];
  let fatPercentages = [0.25, 0.25, 0.25, 0.25];

  if (trainingSlot === 'rest') {
    carbPercentages = [1 / 3, 1 / 3, 1 / 3];
    proteinPercentages = [1 / 3, 1 / 3, 1 / 3];
    fatPercentages = [1 / 3, 1 / 3, 1 / 3];
  } else {
    carbPercentages = [0.15, 0.15, 0.15, 0.15];
    proteinPercentages = [0.225, 0.225, 0.225, 0.225];
    fatPercentages = [0.45, 0.45, 0.45, 0.45];

    SLOT_KEYS.forEach((slotKey, index) => {
      const label = labelMap[slotKey];
      if (label === 'Pre-Workout') {
        carbPercentages[index] = 0.3;
        proteinPercentages[index] = 0.25;
        fatPercentages[index] = 0;
      } else if (label === 'Post-Workout') {
        carbPercentages[index] = 0.4;
        proteinPercentages[index] = 0.3;
        fatPercentages[index] = 0.1;
      }
    });
  }

  const carbs = distributeByPercent(totals.carbs, carbPercentages);
  const protein = distributeByPercent(totals.protein, proteinPercentages);
  const fat = distributeByPercent(totals.fat, fatPercentages);

  return mealSlotKeys.map((slotKey, index) => {
    const calories = Math.round(
      carbs[index] * 4 + protein[index] * 4 + fat[index] * 9
    );
    return {
      slotKey,
      label: labelMap[slotKey],
      carbs: carbs[index],
      protein: protein[index],
      fat: fat[index],
      calories,
    };
  });
}

function resolvePrimaryTrainingSlot(
  trainingSessions: CarbCycleTrainingSession[] | undefined,
  fallbackSlot: CarbCycleTrainingSlot
): CarbCycleTrainingSlot {
  if (!trainingSessions) return fallbackSlot;

  const activeSessions = trainingSessions.filter(
    (session) => session.training_focus !== 'rest'
  );
  if (activeSessions.length === 0) return 'rest';

  const primarySessions = activeSessions.filter(
    (session) => session.is_primary
  );
  if (primarySessions.length !== 1) {
    throw new Error(
      'Training days must have exactly one primary training session.'
    );
  }

  return primarySessions[0].time_slot;
}

export function calculateCarbCycleWeek({
  weekStartDate,
  bodyWeightKg,
  carbsPerKg,
  proteinPerKg,
  fatPerKg,
  template = DEFAULT_CARB_CYCLE_TEMPLATE,
  trainingSlots,
  trainingSessionsByDay,
}: CalculateCarbCycleWeekInput): CarbCycleWeekPlan {
  assertPositive(bodyWeightKg, 'bodyWeightKg');
  assertPositive(carbsPerKg, 'carbsPerKg');
  assertPositive(proteinPerKg, 'proteinPerKg');
  assertPositive(fatPerKg, 'fatPerKg');

  const startDate = parseWeekStartDate(weekStartDate);
  const dayCounts = countTemplateDays(template);

  const weekTotals = {
    carbs: roundMacro(bodyWeightKg * carbsPerKg * 7),
    protein: roundMacro(bodyWeightKg * proteinPerKg * 7),
    fat: roundMacro(bodyWeightKg * fatPerKg * 7),
  };

  const dailyProtein = roundMacro(weekTotals.protein / 7);

  const days = template.map((dayType, dayIndex): CarbCycleDayPlan => {
    const carbs = roundMacro(
      (weekTotals.carbs * CARB_DISTRIBUTION[dayType]) / dayCounts[dayType]
    );
    const fat = roundMacro(
      (weekTotals.fat * FAT_DISTRIBUTION[dayType]) / dayCounts[dayType]
    );
    const calories = Math.round(carbs * 4 + dailyProtein * 4 + fat * 9);
    const trainingSessions = trainingSessionsByDay?.[dayIndex];
    const trainingSlot = resolvePrimaryTrainingSlot(
      trainingSessions,
      trainingSlots?.[dayIndex] ?? 'rest'
    );

    return {
      date: formatDate(addDays(startDate, dayIndex)),
      dayType,
      carbs,
      protein: dailyProtein,
      fat,
      calories,
      trainingSlot,
      trainingSessions,
      meals: buildMealTargets(
        { carbs, protein: dailyProtein, fat },
        trainingSlot
      ),
    };
  });

  const actualWeekTotals = days.reduce(
    (totals, day) => ({
      carbs: roundMacro(totals.carbs + day.carbs),
      protein: roundMacro(totals.protein + day.protein),
      fat: roundMacro(totals.fat + day.fat),
      calories: totals.calories + day.calories,
    }),
    { carbs: 0, protein: 0, fat: 0, calories: 0 }
  );

  return {
    weekStartDate,
    template,
    days,
    weekTotals: actualWeekTotals,
  };
}
