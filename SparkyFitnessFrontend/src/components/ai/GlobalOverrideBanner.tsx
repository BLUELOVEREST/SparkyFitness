import { Button } from '@/components/ui/button';
import { AiServiceSettingsResponse } from '@workspace/shared';
import { Globe, User, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GlobalOverrideBannerProps {
  selectedService?: AiServiceSettingsResponse;
  visionService?: AiServiceSettingsResponse | null;
  visionLoading?: boolean;
  visionError?: boolean;
  activeGlobalSetting: AiServiceSettingsResponse | undefined;
  hasUserOverride: boolean;
  onOverride: () => void;
  onRevert: () => void;
  loading?: boolean;
  isUserConfigAllowed: boolean;
}

export const GlobalOverrideBanner = ({
  selectedService,
  visionService,
  visionLoading = false,
  visionError = false,
  activeGlobalSetting,
  hasUserOverride,
  onOverride,
  onRevert,
  loading = false,
  isUserConfigAllowed,
}: GlobalOverrideBannerProps) => {
  const { t } = useTranslation();

  if (!activeGlobalSetting && !selectedService && isUserConfigAllowed) {
    return null;
  }

  return (
    <div className="space-y-3">
      {!isUserConfigAllowed && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-md border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {t('settings.aiService.userSettings.perUserDisabled')}
            </span>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
            {t('settings.aiService.userSettings.perUserDisabledDescription')}
          </p>
        </div>
      )}
      <div
        data-testid="ai-source-summary"
        className="flex flex-col gap-3 border-y py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex min-w-0 items-start gap-2">
            {selectedService?.is_public ? (
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 break-words font-medium">
              {!selectedService
                ? t('settings.aiService.selection.chat', 'Default chat:')
                : selectedService.is_public
                  ? t('settings.aiService.userSettings.usingGlobalSetting')
                  : t(
                      'settings.aiService.selection.personalSource',
                      'Using personal setting:'
                    )}{' '}
              {selectedService?.service_name ??
                t('settings.aiService.selection.none', 'None')}
              {selectedService?.model_name
                ? ` - ${selectedService.model_name}`
                : ''}
            </span>
          </div>
          <span className="min-w-0 break-words text-muted-foreground">
            {t('settings.aiService.selection.vision', 'Vision:')}{' '}
            {visionError
              ? t('settings.aiService.selection.unavailable', 'Unavailable')
              : visionLoading
                ? t('settings.aiService.selection.loading', 'Loading...')
                : (visionService?.service_name ??
                  t('settings.aiService.selection.none', 'None'))}
            {!visionError && !visionLoading && visionService?.model_name
              ? ` - ${visionService.model_name}`
              : ''}
          </span>
        </div>
        {isUserConfigAllowed && !hasUserOverride && (
          <Button
            onClick={onOverride}
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            disabled={loading || !activeGlobalSetting}
          >
            <User className="h-4 w-4 mr-2" />
            {t(
              'settings.aiService.selection.copyGlobal',
              'Copy to personal configuration'
            )}
          </Button>
        )}
        {isUserConfigAllowed && hasUserOverride && (
          <Button
            onClick={onRevert}
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-auto"
            disabled={loading || !activeGlobalSetting}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('settings.aiService.userSettings.useGlobalSettings')}
          </Button>
        )}
      </div>
    </div>
  );
};
