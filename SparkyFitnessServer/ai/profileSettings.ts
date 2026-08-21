import type {
  AiServiceProfileKey,
  AiServiceProfileOverride,
  AiServiceProfileSettings,
  AiServiceReasoningEffort,
} from '@workspace/shared';
import { DEFAULT_AI_SERVICE_PROFILE_SETTINGS } from '@workspace/shared';

export interface ResolvedAiProfileSettings {
  max_tokens?: number;
  reasoning_effort?: AiServiceReasoningEffort;
  timeoutMs?: number;
  temperature?: number;
  extra_body_json?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeExtraBody(
  value: AiServiceProfileOverride['extra_body_json']
): Record<string, unknown> | undefined {
  return isRecord(value) && Object.keys(value).length > 0 ? value : undefined;
}

export function resolveAiProfileSettings(
  profile: AiServiceProfileKey,
  profileSettings: AiServiceProfileSettings | null | undefined,
  fallbackMaxTokens: number | null | undefined
): ResolvedAiProfileSettings {
  const defaults = DEFAULT_AI_SERVICE_PROFILE_SETTINGS[profile];
  const override = profileSettings?.[profile];
  const maxTokens =
    override?.max_tokens ?? fallbackMaxTokens ?? defaults.max_tokens;
  const timeoutSeconds = override?.timeout_seconds ?? defaults.timeout_seconds;

  return {
    max_tokens: maxTokens,
    reasoning_effort: override?.reasoning_effort ?? defaults.reasoning_effort,
    timeoutMs: timeoutSeconds * 1000,
    temperature: override?.temperature ?? defaults.temperature,
    extra_body_json: normalizeExtraBody(override?.extra_body_json),
  };
}
