import { useTranslation } from 'react-i18next';
import {
  AI_SERVICE_PROFILE_KEYS,
  resolveAiProfileSettings,
  type AiServiceSettingsResponse,
} from '@workspace/shared';

export function GlobalProfileSummary({
  service,
}: {
  service: AiServiceSettingsResponse;
}) {
  const { t } = useTranslation();
  const profileLabels = {
    chat: 'Chat',
    intent: 'Intent',
    vision: 'Vision',
    structured: 'Structured',
  };
  return (
    <details className="border-t pt-3" data-testid="global-profile-summary">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        {t(
          'settings.aiService.selection.resolvedProfileSummary',
          'Task profile values (read-only)'
        )}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          'settings.aiService.selection.resolvedProfileSummaryHint',
          'Values include task overrides, the service token budget, and built-in defaults. Model and provider support may affect the parameters actually sent.'
        )}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {AI_SERVICE_PROFILE_KEYS.map((profile) => {
          const resolved = resolveAiProfileSettings(
            profile,
            service.profile_settings,
            service.max_tokens
          );
          const reasoning =
            profile === 'chat'
              ? (service.profile_settings?.chat?.reasoning_effort ??
                service.reasoning_effort ??
                resolved.reasoning_effort)
              : resolved.reasoning_effort;
          const fields = [
            [
              t('settings.aiService.profileSettings.maxTokens', 'Max tokens'),
              resolved.max_tokens,
            ],
            [
              t(
                'settings.aiService.profileSettings.reasoningEffort',
                'Reasoning effort'
              ),
              t(`settings.aiService.reasoningEffort.${reasoning}`, reasoning),
            ],
            [
              t(
                'settings.aiService.profileSettings.timeoutSeconds',
                'Timeout seconds'
              ),
              resolved.timeoutMs / 1000,
            ],
            [
              t(
                'settings.aiService.profileSettings.temperature',
                'Temperature'
              ),
              resolved.temperature,
            ],
            [
              t(
                'settings.aiService.profileSettings.extraBodyJson',
                'Extra request body JSON'
              ),
              resolved.extra_body_json
                ? t(
                    'settings.aiService.selection.configuredBody',
                    'Configured (contents hidden)'
                  )
                : t(
                    'settings.aiService.selection.noExtraBody',
                    'No additional parameters'
                  ),
            ],
          ];
          return (
            <section key={profile} className="min-w-0">
              <h5 className="text-xs font-medium">
                {t(
                  `settings.aiService.profileSettings.profiles.${profile}`,
                  profileLabels[profile]
                )}
              </h5>
              <dl className="mt-2 space-y-1 text-xs">
                {fields.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-start justify-between gap-2"
                  >
                    <dt className="min-w-0 break-words text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="max-w-[60%] break-words text-right tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </details>
  );
}
