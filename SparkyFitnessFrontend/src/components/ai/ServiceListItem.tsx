import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Edit, Trash2 } from 'lucide-react';
import { getServiceTypes } from '@/utils/aiServiceUtils';
import { ServiceForm } from './ServiceForm';
import { AiServiceSettingsResponse } from '@workspace/shared';
import { UpdateAiServiceSettingsFormInput } from '@/schemas/form/AiServiceSettings.form.zod';
import type { TestConnectionStatus } from '@/hooks/AI/useTestAIServiceConnection';

interface ServiceListItemProps {
  service: AiServiceSettingsResponse;
  isEditing: boolean;
  editData: UpdateAiServiceSettingsFormInput;
  onEditDataChange: (data: UpdateAiServiceSettingsFormInput) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  loading?: boolean;
  translationPrefix?: string;
  showGlobalBadge?: boolean;
  // Forwarded to ServiceForm; this component never calls the test hook itself.
  onTestConnection?: (selectedModel: string) => void;
  testing?: boolean;
  testStatus?: TestConnectionStatus;
}

export const ServiceListItem = ({
  service,
  isEditing,
  editData,
  onEditDataChange,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  loading = false,
  translationPrefix = 'settings.aiService.globalSettings',
  showGlobalBadge = true,
  onTestConnection,
  testing = false,
  testStatus = null,
}: ServiceListItemProps) => {
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
      supports_audio_input:
        editData.supports_audio_input ?? service.supports_audio_input,
      profile_settings:
        editData.profile_settings ?? service.profile_settings ?? {},
      showCustomModelInput: editData.showCustomModelInput ?? false,
      custom_model_name: editData.custom_model_name ?? service.model_name ?? '',
      chat_tool_profile:
        editData.chat_tool_profile ?? service.chat_tool_profile ?? 'full',
    };

    return (
      <div className="overflow-hidden rounded-md border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
          <h4 className="min-w-0 break-words text-sm font-medium">
            {service.service_name}
          </h4>
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
            translationPrefix={translationPrefix}
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
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="min-w-0 break-words text-sm font-medium">
                {service.service_name}
              </h4>
              {showGlobalBadge && service.is_public && (
                <span className="rounded border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {t(`${translationPrefix}.global`)}
                </span>
              )}
            </div>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {serviceTypeLabel}
              {service.model_name && <span>{` - ${service.model_name}`}</span>}
              {service.custom_url && <span>{` - ${service.custom_url}`}</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(
                'ai.userServiceListItem.editService',
                'Edit Service'
              )}
              title={t('ai.userServiceListItem.editService', 'Edit Service')}
              onClick={onStartEdit}
              disabled={loading}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(
                'ai.userServiceListItem.deleteService',
                'Delete Service'
              )}
              title={t(
                'ai.userServiceListItem.deleteService',
                'Delete Service'
              )}
              onClick={onDelete}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {service.system_prompt && (
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {t(`${translationPrefix}.systemPrompt`)}:
            </summary>
            <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {service.system_prompt}
            </p>
          </details>
        )}
      </div>
    </div>
  );
};
