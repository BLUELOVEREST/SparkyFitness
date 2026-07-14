export type FoodMacroRole = 'carb' | 'protein' | 'fat';
export type CarbCyclePlannerDayType = 'low' | 'medium' | 'high';

export interface MacroValues {
  carbs: number;
  protein: number;
  fat: number;
}

export interface RoleFoodMacros extends MacroValues {
  servingSize: number;
}

export interface RecommendCarbCycleMealAmountsInput {
  dayType: CarbCyclePlannerDayType;
  target: MacroValues;
  foods: Partial<Record<FoodMacroRole, RoleFoodMacros>>;
}

export interface RecommendCarbCycleMealAmountsResult {
  amounts: Record<FoodMacroRole, number>;
  actual: MacroValues;
  delta: MacroValues;
}

const ROLE_PRIORITY: Record<CarbCyclePlannerDayType, FoodMacroRole[]> = {
  low: ['protein', 'fat', 'carb'],
  medium: ['protein', 'carb', 'fat'],
  high: ['protein', 'carb', 'fat'],
};

const ROLE_MACRO_KEY: Record<FoodMacroRole, keyof MacroValues> = {
  carb: 'carbs',
  protein: 'protein',
  fat: 'fat',
};

function roundAmount(value: number): number {
  return Math.max(0, Math.round(value));
}

function roundMacro(value: number): number {
  return Math.round(value * 100) / 100;
}

export function inferMacroRole(macros: MacroValues): FoodMacroRole | null {
  const entries: Array<[FoodMacroRole, number]> = [
    ['carb', macros.carbs],
    ['protein', macros.protein],
    ['fat', macros.fat],
  ];
  const [top, second] = entries.sort((a, b) => b[1] - a[1]);
  if (!top || top[1] <= 0) return null;
  if (!second || second[1] === 0 || top[1] > second[1] * 1.3) {
    return top[0];
  }
  return null;
}

export function recommendCarbCycleMealAmounts({
  dayType,
  target,
  foods,
}: RecommendCarbCycleMealAmountsInput): RecommendCarbCycleMealAmountsResult {
  const amounts: Record<FoodMacroRole, number> = {
    carb: 0,
    protein: 0,
    fat: 0,
  };
  const actual: MacroValues = {
    carbs: 0,
    protein: 0,
    fat: 0,
  };

  for (const role of ROLE_PRIORITY[dayType]) {
    const food = foods[role];
    if (!food || food.servingSize <= 0) continue;
    const macroKey = ROLE_MACRO_KEY[role];
    const macroPerServing = food[macroKey];
    if (macroPerServing <= 0) continue;

    const remaining = Math.max(0, target[macroKey] - actual[macroKey]);
    const amount = roundAmount(
      (remaining / macroPerServing) * food.servingSize
    );
    amounts[role] = amount;

    const scale = amount / food.servingSize;
    actual.carbs = roundMacro(actual.carbs + food.carbs * scale);
    actual.protein = roundMacro(actual.protein + food.protein * scale);
    actual.fat = roundMacro(actual.fat + food.fat * scale);
  }

  return {
    amounts,
    actual,
    delta: {
      carbs: roundMacro(actual.carbs - target.carbs),
      protein: roundMacro(actual.protein - target.protein),
      fat: roundMacro(actual.fat - target.fat),
    },
  };
}
