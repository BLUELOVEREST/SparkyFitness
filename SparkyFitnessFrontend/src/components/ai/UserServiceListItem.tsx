import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Globe } from 'lucide-react';
import { getServiceTypes } from '@/utils/aiServiceUtils';
import { ServiceForm } from './ServiceForm';
import { GlobalProfileSummary } from './GlobalProfileSummary';
import { AiServiceSettingsResponse } from '@workspace/shared';
import { UpdateAiServiceSettingsFormInput } from '@/schemas/form/AiServiceSettings.form.zod';
import type { TestConnectionStatus } from '@/hooks/AI/useTestAIServiceConnection';

interface UserServiceListItemProps {
  service: AiServiceSettingsResponse;
  isEditing: boolean;
  editData: UpdateAiServiceSettingsFormInput;
  onEditDataChange: (data: UpdateAiServiceSettingsFormInput) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onToggleActive: (isActive: boolean) => void;
  loading?: boolean;
  isUserConfigAllowed: boolean;
  isOwner: boolean;
  isActiveProvider: boolean;
  // Forwarded to ServiceForm; this component only passes them through and never
  // calls the test hook itself (query hooks aren't allowed inside components).
  onTestConnection?: (selectedModel: string) => void;
  testing?: boolean;
  testStatus?: TestConnectionStatus;
}

export const UserServiceListItem = ({
  service,
  isEditing,
  editData,
  onEditDataChange,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onToggleActive,
  loading = false,
  isUserConfigAllowed,
  isOwner,
  isActiveProvider,
  onTestConnection,
  testing = false,
  testStatus = null,
}: UserServiceListItemProps) => {
  const { t } = useTranslation();
  const serviceTypes = getServiceTypes(t);
  const serviceTypeLabel =
    serviceTypes.find((t) => t.value === service.service_type)?.label ||
    service.service_type;

  if (isEditing) {
    const formData: UpdateAiServiceSettingsFormInput = {
      service_name: editData.service_name ?? service.service_name,
      service_type: editData.service_type || service.service_type,
      api_key: editData.api_key || '',
      custom_url: editData.custom_url ?? service.custom_url ?? '',
      system_prompt: editData.system_prompt ?? service.system_prompt ?? '',
      is_active:
        editData.is_active !== undefined
          ? editData.is_active
          : service.is_active,
      model_name: editData.model_name ?? service.model_name ?? '',
      max_tokens:
        editData.max_tokens !== undefined
          ? editData.max_tokens
          : (service.max_tokens ?? null),
      reasoning_effort: editData.reasoning_effort ?? service.reasoning_effort,
      profile_settings:
        editData.profile_settings ?? service.profile_settings ?? {},
      showCustomModelInput: editData.showCustomModelInput ?? false,
      custom_model_name: editData.custom_model_name ?? service.model_name ?? '',
      chat_tool_profile:
        editData.chat_tool_profile ?? service.chat_tool_profile ?? 'full',
      supports_audio_input:
        editData.supports_audio_input ?? service.supports_audio_input ?? false,
    };

    return (
      <div className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
          <h4 className="min-w-0 break-words text-sm font-medium">
            {service.service_name}
          </h4>
          {isActiveProvider && (
            <span className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {t(
                'settings.aiService.selection.selectedChat',
                t('settings.aiService.userSettings.active')
              )}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {serviceTypeLabel}
          </span>
        </div>
        <div className="p-4">
          <ServiceForm
            serviceId={service.id}
            formData={formData}
            onFormDataChange={(data) => {
              onEditDataChange(data);
            }}
            onSubmit={onUpdate}
            onCancel={onCancelEdit}
            loading={loading}
            isEdit={true}
            translationPrefix="settings.aiService.userSettings"
            onTestConnection={onTestConnection}
            testing={testing}
            testStatus={testStatus}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="min-w-0 break-words text-sm font-medium">
                {service.service_name}
              </h4>

              {/* Admin-managed global setting */}
              {service.is_public && (
                <span className="flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  {t('settings.aiService.userSettings.global')}
                </span>
              )}
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {serviceTypeLabel}
              {service.model_name && <span>{` - ${service.model_name}`}</span>}
              {service.custom_url && <span>{` - ${service.custom_url}`}</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Active toggle — owner only, non-admin services */}
            {isOwner && !service.is_public && isUserConfigAllowed && (
              <Switch
                aria-label={t(
                  'settings.aiService.selection.enabled',
                  'Enabled'
                )}
                checked={service.is_active}
                onCheckedChange={onToggleActive}
                disabled={loading}
              />
            )}

            {/* Admin global: show active badge when it's the selected provider */}
            {isActiveProvider && (
              <span className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {t(
                  'settings.aiService.selection.selectedChat',
                  t('settings.aiService.userSettings.active')
                )}
              </span>
            )}

            {/* Edit/Delete — owner only, non-admin */}
            {!service.is_public && isUserConfigAllowed && isOwner && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onStartEdit}
                  disabled={loading}
                  title={t(
                    'ai.userServiceListItem.editService',
                    'Edit Service'
                  )}
                  aria-label={t(
                    'ai.userServiceListItem.editService',
                    'Edit Service'
                  )}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  disabled={loading}
                  title={t(
                    'ai.userServiceListItem.deleteService',
                    'Delete Service'
                  )}
                  aria-label={t(
                    'ai.userServiceListItem.deleteService',
                    'Delete Service'
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* Admin-managed label */}
            {service.is_public && (
              <span className="text-xs text-muted-foreground">
                {t('settings.aiService.userSettings.managedByAdmin')}
              </span>
            )}
          </div>
        </div>

        {service.system_prompt && (
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {t('settings.aiService.userSettings.systemPrompt')}:
            </summary>
            <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {service.system_prompt}
            </p>
          </details>
        )}
        {service.is_public && <GlobalProfileSummary service={service} />}
      </div>
    </div>
  );
};
