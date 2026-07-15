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
