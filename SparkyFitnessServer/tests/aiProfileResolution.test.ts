import { describe, expect, it } from 'vitest';
import {
  AI_SERVICE_PROFILE_KEYS,
  DEFAULT_AI_SERVICE_PROFILE_SETTINGS,
  resolveAiProfileSettings,
  type AiServiceProfileSettings,
} from '@workspace/shared';
import { resolveAiProfileSettings as serverResolver } from '../ai/profileSettings.js';

describe('shared AI task profile resolution', () => {
  it('keeps server dispatch and configuration summaries on the same resolver', () => {
    expect(serverResolver).toBe(resolveAiProfileSettings);
  });

  it.each(AI_SERVICE_PROFILE_KEYS)(
    'resolves concrete %s defaults',
    (profile) => {
      const defaults = DEFAULT_AI_SERVICE_PROFILE_SETTINGS[profile];
      expect(resolveAiProfileSettings(profile, undefined, null)).toEqual({
        max_tokens: defaults.max_tokens,
        reasoning_effort: defaults.reasoning_effort,
        timeoutMs: defaults.timeout_seconds * 1000,
        temperature: defaults.temperature,
        extra_body_json: undefined,
      });
    }
  );

  it('prefers explicit values, preserves zero and never mutates settings', () => {
    const settings: AiServiceProfileSettings = {
      chat: {
        max_tokens: 2000,
        temperature: 0,
        timeout_seconds: 75,
        reasoning_effort: 'max',
        extra_body_json: { thinking: { enabled: false } },
      },
    };
    const before = structuredClone(settings);
    expect(resolveAiProfileSettings('chat', settings, 8000)).toEqual({
      max_tokens: 2000,
      temperature: 0,
      timeoutMs: 75000,
      reasoning_effort: 'max',
      extra_body_json: { thinking: { enabled: false } },
    });
    expect(settings).toEqual(before);
  });

  it('uses service tokens for missing or null task values, otherwise built-in defaults', () => {
    const settings: AiServiceProfileSettings = {
      intent: {
        max_tokens: null,
        timeout_seconds: null,
        temperature: null,
        reasoning_effort: null,
        extra_body_json: {},
      },
    };
    expect(resolveAiProfileSettings('intent', settings, 8000)).toEqual({
      max_tokens: 8000,
      timeoutMs: 30000,
      temperature: 0,
      reasoning_effort: 'low',
      extra_body_json: undefined,
    });
    expect(resolveAiProfileSettings('intent', settings, null).max_tokens).toBe(
      1024
    );
  });
});
