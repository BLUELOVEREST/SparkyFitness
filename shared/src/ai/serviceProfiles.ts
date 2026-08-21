import type {
  AiServiceProfileKey,
  AiServiceProfileSettings,
} from "../schemas/database/AiServiceSettings.zod.ts";

export const AI_SERVICE_PROFILE_KEYS = [
  "chat",
  "intent",
  "vision",
  "structured",
] as const satisfies readonly AiServiceProfileKey[];

export const DEFAULT_AI_SERVICE_PROFILE_SETTINGS = {
  chat: {
    max_tokens: 4096,
    reasoning_effort: "high",
    timeout_seconds: 300,
    temperature: 0.3,
    extra_body_json: {},
  },
  intent: {
    max_tokens: 1024,
    reasoning_effort: "low",
    timeout_seconds: 30,
    temperature: 0,
    extra_body_json: {},
  },
  vision: {
    max_tokens: 4096,
    reasoning_effort: "high",
    timeout_seconds: 120,
    temperature: 0,
    extra_body_json: {},
  },
  structured: {
    max_tokens: 2048,
    reasoning_effort: "low",
    timeout_seconds: 60,
    temperature: 0,
    extra_body_json: {},
  },
} as const satisfies Required<AiServiceProfileSettings>;
