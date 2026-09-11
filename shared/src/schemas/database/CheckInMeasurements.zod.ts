import { z } from "zod";

export const checkInMeasurementsSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  entry_date: z.coerce.date(),
  weight: z.number().nullable(),
  neck: z.number().nullable(),
  waist: z.number().nullable(),
  hips: z.number().nullable(),
  shoulders: z.number().nullable(),
  chest: z.number().nullable(),
  abdomen: z.number().nullable(),
  left_biceps: z.number().nullable(),
  right_biceps: z.number().nullable(),
  left_thigh: z.number().nullable(),
  right_thigh: z.number().nullable(),
  left_calf: z.number().nullable(),
  right_calf: z.number().nullable(),
  steps: z.number().nullable(),
  created_at: z.coerce.date().nullable().optional(),
  updated_at: z.coerce.date().nullable().optional(),
  height: z.number().nullable(),
  body_fat_percentage: z.number().nullable(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
  muscle_mass_kg: z.number().nullable(),
  bone_mass_kg: z.number().nullable(),
  body_water_percentage: z.number().nullable(),
  bmr: z.number().nullable(),
});

export const checkInMeasurementsInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  entry_date: z.coerce.date().optional(),
  weight: z.number().optional().nullable(),
  neck: z.number().optional().nullable(),
  waist: z.number().optional().nullable(),
  hips: z.number().optional().nullable(),
  shoulders: z.number().optional().nullable(),
  chest: z.number().optional().nullable(),
  abdomen: z.number().optional().nullable(),
  left_biceps: z.number().optional().nullable(),
  right_biceps: z.number().optional().nullable(),
  left_thigh: z.number().optional().nullable(),
  right_thigh: z.number().optional().nullable(),
  left_calf: z.number().optional().nullable(),
  right_calf: z.number().optional().nullable(),
  steps: z.number().optional().nullable(),
  created_at: z.coerce.date().nullable().optional(),
  updated_at: z.coerce.date().nullable().optional(),
  height: z.number().optional().nullable(),
  body_fat_percentage: z.number().optional().nullable(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
  muscle_mass_kg: z.number().optional().nullable(),
  bone_mass_kg: z.number().optional().nullable(),
  body_water_percentage: z.number().optional().nullable(),
  bmr: z.number().optional().nullable(),
});

export const checkInMeasurementsMutatorSchema =
  checkInMeasurementsInitializerSchema.partial();

export type DatabaseCheckInMeasurements = z.infer<
  typeof checkInMeasurementsSchema
>;
export type DatabaseCheckInMeasurementsInitializer = z.infer<
  typeof checkInMeasurementsInitializerSchema
>;
export type DatabaseCheckInMeasurementsMutator = z.infer<
  typeof checkInMeasurementsMutatorSchema
>;
