import {
  aiServiceProfileOverrideSchema,
  aiServiceProfileSettingsSchema,
  createAiServiceSettingsRequestSchema,
  updateAiServiceSettingsRequestSchema,
} from '@workspace/shared';
import { z } from 'zod';

const aiServiceProfileOverrideFormSchema = aiServiceProfileOverrideSchema
  .extend({
    extra_body_json_draft: z.string().optional(),
  })
  .transform(({ extra_body_json_draft: _draft, ...rest }) => rest);

const aiServiceProfileSettingsFormSchema = z
  .object({
    chat: aiServiceProfileOverrideFormSchema.optional(),
    intent: aiServiceProfileOverrideFormSchema.optional(),
    vision: aiServiceProfileOverrideFormSchema.optional(),
    structured: aiServiceProfileOverrideFormSchema.optional(),
  })
  .strict();

const formExtension = {
  showCustomModelInput: z.boolean().optional().default(false),
  custom_model_name: z.string().optional().default(''),
  profile_settings: aiServiceProfileSettingsFormSchema
    .optional()
    .nullable()
    .default({}),
};

export const createAiServiceSettingsFormSchema =
  createAiServiceSettingsRequestSchema
    .extend({
      ...formExtension,
    })
    .transform(({ showCustomModelInput, custom_model_name, ...rest }) => ({
      ...rest,
      model_name: showCustomModelInput ? custom_model_name : rest.model_name,
      profile_settings: aiServiceProfileSettingsSchema.parse(
        rest.profile_settings ?? {}
      ),
    }));

export const updateAiServiceSettingsFormSchema =
  updateAiServiceSettingsRequestSchema
    .extend({
      ...formExtension,
    })
    .transform(({ showCustomModelInput, custom_model_name, ...rest }) => ({
      ...rest,
      model_name: showCustomModelInput ? custom_model_name : rest.model_name,
      profile_settings: aiServiceProfileSettingsSchema.parse(
        rest.profile_settings ?? {}
      ),
    }));

// Input types (what the form state holds)
export type CreateAiServiceSettingsFormInput = z.input<
  typeof createAiServiceSettingsFormSchema
>;
export type UpdateAiServiceSettingsFormInput = z.input<
  typeof updateAiServiceSettingsFormSchema
>;

// Union type representing form data for both create and edit modes
export type AiServiceSettingsFormInput =
  | CreateAiServiceSettingsFormInput
  | UpdateAiServiceSettingsFormInput;
