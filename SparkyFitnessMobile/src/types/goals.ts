export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  water_goal_ml?: number;
  target_exercise_calories_burned?: number;
  target_exercise_duration_minutes?: number;
  protein_percentage?: number;
  carbs_percentage?: number;
  fat_percentage?: number;
  breakfast_percentage?: number;
  lunch_percentage?: number;
  dinner_percentage?: number;
  snacks_percentage?: number;
  custom_nutrients?: Record<string, string | number>;
  custom_meal_percentages?: Record<string, number>;
}

export type CarbCycleDayType = 'high' | 'medium' | 'low';
export type CarbCycleTrainingSlot =
  | 'rest'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'evening';

export type CarbCycleTrainingSlots = [
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
  time_slot: 'morning' | 'noon' | 'afternoon' | 'evening';
  training_focus: string;
  is_primary: boolean;
}

export interface CarbCycleInput {
  weekStartDate: string;
  bodyWeightKg: number;
  carbsPerKg: number;
  proteinPerKg: number;
  fatPerKg: number;
  trainingSlots?: CarbCycleTrainingSlots;
  trainingSessionsByDay?: CarbCycleTrainingSession[][];
}

export interface CarbCycleMealTarget {
  slotKey: 'morning' | 'noon' | 'afternoon' | 'evening';
  label: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

export interface CarbCycleDayTarget {
  date: string;
  dayType: CarbCycleDayType;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  trainingSlot: CarbCycleTrainingSlot;
  trainingSessions?: CarbCycleTrainingSession[];
  meals: CarbCycleMealTarget[];
}

export interface CarbCycleWeekResult {
  weekStartDate: string;
  weekTotals: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
  };
  days: CarbCycleDayTarget[];
}
