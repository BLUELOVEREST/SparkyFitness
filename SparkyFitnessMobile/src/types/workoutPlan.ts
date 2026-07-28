export type WorkoutPlanMode = 'detailed' | 'training_focus';

export type TrainingFocusTimeSlot = 'morning' | 'noon' | 'afternoon' | 'evening';

export type TrainingFocusValue =
  | 'rest'
  | 'chest'
  | 'back'
  | 'legs'
  | 'shoulders'
  | 'arms'
  | 'cardio'
  | 'full_body'
  | 'custom'
  | string;

export interface WorkoutPlanFocusSession {
  id?: string | number;
  template_id?: string | number;
  day_of_week: number;
  time_slot: TrainingFocusTimeSlot;
  training_focus: TrainingFocusValue;
  is_primary: boolean;
}

export interface WorkoutPlanAssignment {
  id?: string | number;
  day_of_week: number;
  workout_preset_id?: string | number | null;
  exercise_id?: string | number | null;
  sort_order?: number | null;
}

export interface WorkoutPlanTemplate {
  id?: string;
  user_id?: string;
  plan_name: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  plan_mode?: WorkoutPlanMode;
  assignments: WorkoutPlanAssignment[];
  focus_sessions?: WorkoutPlanFocusSession[];
}

export type SaveWorkoutPlanTemplatePayload = Omit<
  WorkoutPlanTemplate,
  'id' | 'user_id'
> & {
  id?: string;
};
