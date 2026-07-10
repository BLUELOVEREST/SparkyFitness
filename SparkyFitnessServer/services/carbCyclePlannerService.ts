export type CarbCycleDayType = 'low' | 'medium' | 'high';

export type CarbCycleTemplate = readonly [
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
  CarbCycleDayType,
];

export interface CalculateCarbCycleWeekInput {
  weekStartDate: string;
  bodyWeightKg: number;
  carbsPerKg: number;
  proteinPerKg: number;
  fatPerKg: number;
  template?: CarbCycleTemplate;
}

export interface CarbCycleDayPlan {
  date: string;
  dayType: CarbCycleDayType;
  carbs: number;
  protein: number;
  fat: number;
  calories: number;
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

export function calculateCarbCycleWeek({
  weekStartDate,
  bodyWeightKg,
  carbsPerKg,
  proteinPerKg,
  fatPerKg,
  template = DEFAULT_CARB_CYCLE_TEMPLATE,
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

    return {
      date: formatDate(addDays(startDate, dayIndex)),
      dayType,
      carbs,
      protein: dailyProtein,
      fat,
      calories,
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
