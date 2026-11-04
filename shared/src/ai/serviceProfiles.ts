import type {
  AiServiceProfileKey,
  AiServiceProfileSettings,
  AiServiceProfileOverride,
  AiServiceReasoningEffort,
} from '../schemas/database/AiServiceSettings.zod.ts';

export const AI_SERVICE_PROFILE_KEYS = [
  'chat',
  'intent',
  'vision',
  'structured',
] as const satisfies readonly AiServiceProfileKey[];

export const DEFAULT_AI_SERVICE_PROFILE_SETTINGS = {
  chat: {
    max_tokens: 4096,
    reasoning_effort: 'high',
    timeout_seconds: 300,
    temperature: 0.3,
    extra_body_json: {},
  },
  intent: {
    max_tokens: 1024,
    reasoning_effort: 'low',
    timeout_seconds: 30,
    temperature: 0,
    extra_body_json: {},
  },
  vision: {
    max_tokens: 4096,
    reasoning_effort: 'high',
    timeout_seconds: 120,
    temperature: 0,
    extra_body_json: {},
  },
  structured: {
    max_tokens: 2048,
    reasoning_effort: 'low',
    timeout_seconds: 60,
    temperature: 0,
    extra_body_json: {},
  },
} as const satisfies Required<AiServiceProfileSettings>;

export interface ResolvedAiProfileSettings {
  max_tokens?: number;
  reasoning_effort?: AiServiceReasoningEffort;
  timeoutMs?: number;
  temperature?: number;
  extra_body_json?: Record<string, unknown>;
}

type CompleteAiProfileSettings = Required<
  Omit<ResolvedAiProfileSettings, 'extra_body_json'>
> &
  Pick<ResolvedAiProfileSettings, 'extra_body_json'>;

function normalizeExtraBody(
  value: AiServiceProfileOverride['extra_body_json']
): Record<string, unknown> | undefined {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
    ? value
    : undefined;
}

export function resolveAiProfileSettings(
  profile: AiServiceProfileKey,
  profileSettings: AiServiceProfileSettings | null | undefined,
  fallbackMaxTokens: number | null | undefined
): CompleteAiProfileSettings {
  const defaults = DEFAULT_AI_SERVICE_PROFILE_SETTINGS[profile];
  const override = profileSettings?.[profile];
  return {
    max_tokens:
      override?.max_tokens ?? fallbackMaxTokens ?? defaults.max_tokens,
    reasoning_effort: override?.reasoning_effort ?? defaults.reasoning_effort,
    timeoutMs: (override?.timeout_seconds ?? defaults.timeout_seconds) * 1000,
    temperature: override?.temperature ?? defaults.temperature,
    extra_body_json: normalizeExtraBody(override?.extra_body_json),
  };
}
