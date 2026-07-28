import type { CarbCycleMealTarget } from './goals';

export interface PlannedMealItem {
  id: string;
  type: 'food' | 'meal';
  name: string;
  quantity?: number;
  unit?: string;
  amountLabel: string;
  macroRole?: 'carb' | 'protein' | 'fat' | null;
  foodId?: string | null;
  mealId?: string | null;
  variantId?: string | null;
}

export interface ActiveMealPlanDayMeal {
  mealTypeId: string | null;
  key: string;
  mealType?: string;
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

export interface MealPlanTemplateAssignment {
  id?: string;
  item_type: 'food' | 'meal';
  day_of_week: number;
  meal_type?: string;
  meal_type_id?: string;
  food_id?: string | null;
  food_name?: string | null;
  meal_id?: string | null;
  meal_name?: string | null;
  variant_id?: string | null;
  quantity?: number | null;
  unit?: string | null;
  macro_role?: 'carb' | 'protein' | 'fat' | null;
}

export interface MealPlanTemplate {
  id?: string;
  user_id?: string;
  plan_name: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  macro_targets?: Record<number, CarbCycleMealTarget[]>;
  assignments: MealPlanTemplateAssignment[];
}

export type SaveMealPlanTemplatePayload = Omit<MealPlanTemplate, 'id' | 'user_id'> & {
  id?: string;
};
