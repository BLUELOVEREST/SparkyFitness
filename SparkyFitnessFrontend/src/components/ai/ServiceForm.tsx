import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { isGpt6Model } from '@workspace/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Save,
  X,
  Plug,
  Loader2,
  AlertTriangle,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AI_SERVICE_PROFILE_KEYS,
  DEFAULT_AI_SERVICE_PROFILE_SETTINGS,
  aiServiceProfileOverrideSchema,
  type AiServiceProfileKey,
  type AiServiceProfileOverride,
  type AiServiceProfileSettings,
} from '@workspace/shared';
import {
  getServiceTypes,
  getModelOptions,
  requiresApiKey,
  supportsVoiceTranscriptionServiceType,
} from '@/utils/aiServiceUtils';
import { useToast } from '@/hooks/use-toast';
import {
  AiServiceSettingsFormInput,
  UpdateAiServiceSettingsFormInput,
} from '@/schemas/form/AiServiceSettings.form.zod';
import type { TestConnectionStatus } from '@/hooks/AI/useTestAIServiceConnection';
import { ModelDiscovery } from './ModelDiscovery';

type ProfileFormOverride = AiServiceProfileOverride & {
  extra_body_json_draft?: string;
};

type ProfileFormSettings = Partial<
  Record<AiServiceProfileKey, ProfileFormOverride>
>;

const profileNumericSchema = aiServiceProfileOverrideSchema.pick({
  max_tokens: true,
  timeout_seconds: true,
  temperature: true,
});

function validateProfileNumbers(profile: ProfileFormOverride) {
  return profileNumericSchema.safeParse({
    max_tokens: profile.max_tokens,
    timeout_seconds: profile.timeout_seconds,
    temperature: profile.temperature,
  });
}

const PROFILE_DESCRIPTIONS: Record<AiServiceProfileKey, string> = {
  chat: 'settings.aiService.profileSettings.descriptions.chat',
  intent: 'settings.aiService.profileSettings.descriptions.intent',
  vision: 'settings.aiService.profileSettings.descriptions.vision',
  structured: 'settings.aiService.profileSettings.descriptions.structured',
};

const PROFILE_LABEL_FALLBACKS: Record<AiServiceProfileKey, string> = {
  chat: 'Chat',
  intent: 'Intent',
  vision: 'Vision',
  structured: 'Structured',
};

const PROFILE_DESCRIPTION_FALLBACKS: Record<AiServiceProfileKey, string> = {
  chat: 'Ordinary chat and health coaching.',
  intent: 'Tool and domain classification for SparkyFitness actions.',
  vision: 'Food photo and nutrition label scanning.',
  structured:
    'JSON output, food options, unit conversion, and tool parameters.',
};

function profileLabelKey(profile: AiServiceProfileKey): string {
  return `settings.aiService.profileSettings.profiles.${profile}`;
}

function getProfileSettings(
  formData: AiServiceSettingsFormInput
): ProfileFormSettings {
  return (formData.profile_settings ?? {}) as ProfileFormSettings;
}

function getProfileDraft(profile: ProfileFormOverride): string {
  if (typeof profile.extra_body_json_draft === 'string') {
    return profile.extra_body_json_draft;
  }
  return JSON.stringify(profile.extra_body_json ?? {}, null, 2);
}

function hasInvalidProfileJson(profile: ProfileFormOverride): boolean {
  try {
    const parsed: unknown = JSON.parse(getProfileDraft(profile));
    return (
      typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)
    );
  } catch {
    return true;
  }
}

function hasProfileOverride(profile: ProfileFormOverride | undefined): boolean {
  if (!profile) return false;
  return (
    profile.max_tokens !== undefined ||
    profile.reasoning_effort !== undefined ||
    profile.timeout_seconds !== undefined ||
    profile.temperature !== undefined ||
    (profile.extra_body_json !== undefined &&
      Object.keys(profile.extra_body_json ?? {}).length > 0)
  );
}

interface ServiceFormProps {
  serviceId?: string;
  formData: AiServiceSettingsFormInput;
  onFormDataChange: (data: UpdateAiServiceSettingsFormInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading?: boolean;
  isEdit?: boolean;
  translationPrefix?: string; // 'settings.aiService.globalSettings' or 'settings.aiService.userSettings'
  // When provided, renders a "Test Connection" button that runs a live check
  // against the current config. Receives the effective model the form resolves.
  onTestConnection?: (selectedModel: string) => void;
  testing?: boolean;
  // Inline result shown next to the button; hidden while a test is in flight.
  testStatus?: TestConnectionStatus;
}

export const ServiceForm = ({
  serviceId,
  formData,
  onFormDataChange,
  onSubmit,
  onCancel,
  loading = false,
  isEdit = false,
  translationPrefix = 'settings.aiService.globalSettings',
  onTestConnection,
  testing = false,
  testStatus = null,
}: ServiceFormProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedProfile, setSelectedProfile] =
    useState<AiServiceProfileKey>('intent');
  const [jsonOpen, setJsonOpen] = useState<
    Partial<Record<AiServiceProfileKey, boolean>>
  >({});
  const serviceTypes = getServiceTypes(t);
  const modelOptions = getModelOptions(formData.service_type ?? '');
  const profileSettings = getProfileSettings(formData);
  const selectedDefaults = DEFAULT_AI_SERVICE_PROFILE_SETTINGS[selectedProfile];
  const selectedOverride = profileSettings[selectedProfile] ?? {};
  const selectedProfileData: ProfileFormOverride = {
    ...selectedDefaults,
    ...selectedOverride,
  };

  const updateSelectedProfile = (data: Partial<ProfileFormOverride>) => {
    onFormDataChange({
      profile_settings: {
        ...profileSettings,
        [selectedProfile]: {
          ...selectedOverride,
          ...data,
        },
      } as AiServiceProfileSettings,
    });
  };

  const resetSelectedProfile = () => {
    const nextSettings: ProfileFormSettings = { ...profileSettings };
    delete nextSettings[selectedProfile];
    setJsonOpen((previous) => ({ ...previous, [selectedProfile]: false }));
    onFormDataChange({
      profile_settings: nextSettings as AiServiceProfileSettings,
    });
  };

  const selectedJsonDraft = getProfileDraft(selectedProfileData);
  const profileValidation = AI_SERVICE_PROFILE_KEYS.map((profile) => ({
    profile,
    invalidJson: hasInvalidProfileJson(profileSettings[profile] ?? {}),
    numbers: validateProfileNumbers(profileSettings[profile] ?? {}),
  }));
  const invalidProfiles = profileValidation
    .filter(
      (validation) => validation.invalidJson || !validation.numbers.success
    )
    .map((validation) => validation.profile);
  const selectedValidation = profileValidation.find(
    (validation) => validation.profile === selectedProfile
  );
  const selectedJsonIsInvalid = selectedValidation?.invalidJson ?? false;
  const selectedNumericIssues =
    selectedValidation?.numbers.success === false
      ? selectedValidation.numbers.error.issues
      : [];
  const invalidParametersMessage = t(
    'settings.aiService.profileSettings.invalidParameters',
    'Enter valid values for the highlighted profile parameters.'
  );
  const numericFieldInvalid = (
    field: 'max_tokens' | 'timeout_seconds' | 'temperature'
  ) => selectedNumericIssues.some((issue) => issue.path[0] === field);
  const voiceRoutingSupported = supportsVoiceTranscriptionServiceType(
    formData.service_type
  );

  // The effective model is whichever input is active for this service type.
  const selectedModel = (
    formData.showCustomModelInput
      ? formData.custom_model_name
      : formData.model_name
  )?.trim();

  const requiresCustomUrl =
    formData.service_type === 'custom' ||
    formData.service_type === 'ollama' ||
    formData.service_type === 'openai_compatible';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const invalidProfile = invalidProfiles[0];
        if (invalidProfile) {
          const invalidJson = profileValidation.find(
            (validation) => validation.profile === invalidProfile
          )?.invalidJson;
          setSelectedProfile(invalidProfile);
          if (invalidJson)
            setJsonOpen((previous) => ({
              ...previous,
              [invalidProfile]: true,
            }));
          toast({
            title: t(`${translationPrefix}.error`),
            description: invalidJson
              ? t(
                  'settings.aiService.profileSettings.invalidJson',
                  'Extra request body must be a valid JSON object.'
                )
              : invalidParametersMessage,
            variant: 'destructive',
          });
          return;
        }
        // Providers with preset models (openai, anthropic, ...) have a sensible
        // server-side default, so a blank model is fine. Types without presets
        // (openai_compatible/custom/ollama) point at user-hosted servers with no
        // reliable default, so require an explicit model there.
        if (modelOptions.length === 0 && !selectedModel) {
          toast({
            title: t(`${translationPrefix}.error`),
            description: t(`${translationPrefix}.fillRequiredFields`),
            variant: 'destructive',
          });
          return;
        }
        onSubmit();
      }}
      className="space-y-4 [&_input]:h-9 [&_label]:text-xs [&_[role=combobox]]:h-9"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="service_name">
            {t(`${translationPrefix}.serviceName`)}
          </Label>
          <Input
            id="service_name"
            value={formData.service_name}
            onChange={(e) => onFormDataChange({ service_name: e.target.value })}
            placeholder={t(`${translationPrefix}.serviceNamePlaceholder`)}
            autoComplete="username"
          />
        </div>
        <div>
          <Label htmlFor="service_type">
            {t(`${translationPrefix}.serviceType`)}
          </Label>
          <Select
            value={formData.service_type}
            onValueChange={(value) =>
              onFormDataChange({
                service_type: value,
                // Keep the chosen ID; discovery is invalidated separately.
                model_name: selectedModel ?? '',
                custom_model_name: selectedModel ?? '',
                // Types without preset models (openai_compatible/custom/ollama)
                // have no dropdown, so reveal the custom-model input directly.
                showCustomModelInput:
                  getModelOptions(value).length === 0 ||
                  !getModelOptions(value).includes(selectedModel ?? ''),
                // Default all services to the 'full' tool profile.
                // Users can manually select 'core' if they wish to optimize
                // their local system performance, and are guided by warnings.
                chat_tool_profile: 'full',
                supports_audio_input: false,
              })
            }
          >
            <SelectTrigger id="service_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {serviceTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        data-testid="ai-connection-fields"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {requiresCustomUrl && (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="custom_url">
              {t(`${translationPrefix}.customUrl`)}
            </Label>
            <Input
              id="custom_url"
              value={formData.custom_url ?? ''}
              onChange={(e) => onFormDataChange({ custom_url: e.target.value })}
              className="font-mono text-xs"
              placeholder={
                formData.service_type === 'ollama'
                  ? t(`${translationPrefix}.customUrlPlaceholderOllama`)
                  : t(`${translationPrefix}.customUrlPlaceholder`)
              }
            />
          </div>
        )}
        <div
          className={
            requiresCustomUrl
              ? 'min-w-0 space-y-1.5'
              : 'min-w-0 space-y-1.5 sm:col-span-2'
          }
        >
          <Label htmlFor="api_key">
            {requiresApiKey(formData.service_type)
              ? t(`${translationPrefix}.apiKey`)
              : t(`${translationPrefix}.apiKeyOptional`)}
          </Label>
          <Input
            id="api_key"
            type="password"
            value={formData.api_key}
            onChange={(e) => onFormDataChange({ api_key: e.target.value })}
            placeholder={
              formData.service_type === 'ollama'
                ? t(`${translationPrefix}.apiKeyPlaceholderOllama`)
                : isEdit
                  ? t(`${translationPrefix}.enterNewApiKey`)
                  : t(`${translationPrefix}.apiKeyPlaceholder`)
            }
            autoComplete={isEdit ? 'off' : 'new-password'}
          />
          {isEdit && formData.service_type !== 'ollama' && (
            <p className="text-xs text-muted-foreground mt-1">
              {t(`${translationPrefix}.apiKeyUpdateDescription`)}
            </p>
          )}
        </div>
      </div>

      {formData.service_type === 'openai' &&
        isGpt6Model(selectedModel ?? '') && (
          <div>
            <Label htmlFor="reasoning_effort">
              {t('settings.aiService.reasoningEffort.label')}
            </Label>
            <Select
              value={formData.reasoning_effort ?? 'medium'}
              onValueChange={(value) =>
                onFormDataChange({
                  reasoning_effort: value as
                    'low' | 'medium' | 'high' | 'xhigh' | 'max',
                })
              }
            >
              <SelectTrigger id="reasoning_effort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['low', 'medium', 'high', 'xhigh', 'max'] as const).map(
                  (effort) => (
                    <SelectItem key={effort} value={effort}>
                      {t(`settings.aiService.reasoningEffort.${effort}`)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.aiService.reasoningEffort.description')}
            </p>
          </div>
        )}

      {/* Self-hosted types (ollama/openai_compatible/custom) can point at
          small local models with no prompt cache, where the full 35-tool
          block is the dominant per-turn token cost — offer the leaner 'core'
          profile for all of them. The server only honors 'core' for these
          types (see chatService.prepareChatContext). */}
      {requiresCustomUrl && (
        <>
          <div>
            <Label htmlFor="chat_tool_profile">
              {t(`${translationPrefix}.chatToolProfile`)}
            </Label>
            <Select
              value={formData.chat_tool_profile ?? 'full'}
              onValueChange={(value) =>
                onFormDataChange({
                  chat_tool_profile: value as 'full' | 'core',
                })
              }
            >
              <SelectTrigger id="chat_tool_profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">
                  {t(`${translationPrefix}.chatToolProfileFull`)}
                </SelectItem>
                <SelectItem value="core">
                  {t(`${translationPrefix}.chatToolProfileCore`)}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t(`${translationPrefix}.chatToolProfileDescription`)}
            </p>
          </div>

          {formData.service_type === 'ollama' &&
            (formData.chat_tool_profile === 'full' ||
              !formData.chat_tool_profile) && (
              <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-medium">
                    {t(`${translationPrefix}.ollamaFullProfileWarningTitle`)}
                  </p>
                  <p className="mt-1">
                    {t(`${translationPrefix}.ollamaFullProfileWarningHint`)}
                  </p>
                </div>
              </div>
            )}

          {/* Ollama silently truncates prompts past its default 4096-token
              context, which corrupts tool calls. Surface this prominently so
              users raise it before blaming the model. */}
          {formData.service_type === 'ollama' && (
            <div className="flex gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-medium">
                  {t(`${translationPrefix}.ollamaContextTitle`)}
                </p>
                <p className="mt-1">
                  {t(`${translationPrefix}.ollamaContextHint`)}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {formData.service_type === 'openai_compatible' && (
        <ModelDiscovery
          serviceId={serviceId}
          serviceType={formData.service_type}
          customUrl={formData.custom_url}
          apiKey={formData.api_key}
          value={selectedModel ?? ''}
          onChange={(value) =>
            onFormDataChange({
              model_name: value,
              custom_model_name: value,
              showCustomModelInput: true,
            })
          }
        />
      )}

      {formData.service_type !== 'openai_compatible' && (
        <div className="flex items-center space-x-2 mb-4">
          <Switch
            id="use_custom_model"
            checked={formData.showCustomModelInput ?? false}
            onCheckedChange={(checked) =>
              onFormDataChange({ showCustomModelInput: checked })
            }
          />
          <Label htmlFor="use_custom_model">
            {t(`${translationPrefix}.useCustomModel`)}
          </Label>
        </div>
      )}

      {formData.service_type !== 'openai_compatible' &&
        !formData.showCustomModelInput &&
        modelOptions.length > 0 && (
          <div>
            <Label htmlFor="model_name_select">
              {t(`${translationPrefix}.model`)}
            </Label>
            <Select
              value={formData.model_name ?? ''}
              onValueChange={(value) => onFormDataChange({ model_name: value })}
            >
              <SelectTrigger id="model_name_select">
                <SelectValue
                  placeholder={t(`${translationPrefix}.selectModel`)}
                />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {t(`${translationPrefix}.recommendedModel`, {
                model: modelOptions[0],
              })}
            </p>
          </div>
        )}

      {formData.service_type !== 'openai_compatible' &&
        formData.showCustomModelInput && (
          <div>
            <Label htmlFor="custom_model_name_input">
              {t(`${translationPrefix}.customModelName`)}
            </Label>
            <Input
              id="custom_model_name_input"
              value={formData.custom_model_name ?? ''}
              onChange={(e) =>
                onFormDataChange({ custom_model_name: e.target.value })
              }
              placeholder={t(`${translationPrefix}.customModelNamePlaceholder`)}
            />
          </div>
        )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        {voiceRoutingSupported ? (
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Switch
                id="supports_audio_input"
                checked={formData.supports_audio_input ?? false}
                onCheckedChange={(checked) =>
                  onFormDataChange({ supports_audio_input: checked })
                }
              />
              <Label htmlFor="supports_audio_input">
                {t(`${translationPrefix}.supportsAudioInput`)}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(`${translationPrefix}.supportsAudioInputDescription`)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t(`${translationPrefix}.audioInputProviderUnsupported`)}
          </p>
        )}

        <div>
          <Label htmlFor="max_tokens">
            {t(`${translationPrefix}.maxTokens`, 'Max tokens')}
          </Label>
          <Input
            id="max_tokens"
            type="number"
            min={1}
            step={1}
            value={formData.max_tokens ?? ''}
            onChange={(e) =>
              onFormDataChange({
                max_tokens: e.target.value ? Number(e.target.value) : null,
              })
            }
            placeholder={t(
              `${translationPrefix}.maxTokensPlaceholder`,
              'Leave blank for provider default'
            )}
            inputMode="numeric"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              `${translationPrefix}.maxTokensDescription`,
              'Optional output token limit sent with AI requests.'
            )}
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="system_prompt">
          {t(`${translationPrefix}.systemPrompt`, 'System prompt')}
        </Label>
        <Textarea
          id="system_prompt"
          value={formData.system_prompt ?? ''}
          onChange={(e) => onFormDataChange({ system_prompt: e.target.value })}
          placeholder={t(
            `${translationPrefix}.systemPromptPlaceholder`,
            'Additional instructions for this AI service'
          )}
          rows={3}
          className="mt-1.5 font-mono text-xs"
        />
      </div>

      <div
        data-testid="ai-profile-settings"
        className="space-y-3 border-t border-border/80 pt-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-medium">
              {t('settings.aiService.profileSettings.title', 'Task profiles')}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                'settings.aiService.profileSettings.description',
                'Tune model behavior for specific AI tasks.'
              )}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {t(
              'settings.aiService.profileSettings.builtInPromptBadge',
              'Built-in prompts'
            )}
          </span>
        </div>

        <Tabs
          value={selectedProfile}
          onValueChange={(value) =>
            setSelectedProfile(value as AiServiceProfileKey)
          }
        >
          <TabsList
            aria-label={t(
              'settings.aiService.profileSettings.title',
              'Task profiles'
            )}
            className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4"
          >
            {AI_SERVICE_PROFILE_KEYS.map((profile) => {
              const custom = hasProfileOverride(profileSettings[profile]);
              return (
                <TabsTrigger
                  key={profile}
                  value={profile}
                  className="min-w-0 flex-wrap gap-x-1.5 gap-y-0.5 px-2 py-1.5 text-xs whitespace-normal"
                >
                  <span>
                    {t(
                      profileLabelKey(profile),
                      PROFILE_LABEL_FALLBACKS[profile]
                    )}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {custom
                      ? t('settings.aiService.profileSettings.custom', 'Custom')
                      : t(
                          'settings.aiService.profileSettings.default',
                          'Default'
                        )}
                  </span>
                  {invalidProfiles.includes(profile) && (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-destructive"
                      aria-label={
                        profileValidation.find(
                          (validation) => validation.profile === profile
                        )?.invalidJson
                          ? t(
                              'settings.aiService.profileSettings.invalidJsonBadge',
                              'Invalid JSON'
                            )
                          : t(
                              'settings.aiService.profileSettings.invalidParametersBadge',
                              'Invalid parameters'
                            )
                      }
                    />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent
            value={selectedProfile}
            className="mt-3 space-y-3 bg-muted/40 p-3 rounded-md"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h5 className="text-sm font-medium">
                  {t(
                    profileLabelKey(selectedProfile),
                    PROFILE_LABEL_FALLBACKS[selectedProfile]
                  )}
                </h5>
                <p className="text-xs text-muted-foreground mt-1">
                  {t(
                    PROFILE_DESCRIPTIONS[selectedProfile],
                    PROFILE_DESCRIPTION_FALLBACKS[selectedProfile]
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetSelectedProfile}
                className="h-8 shrink-0 text-xs"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {t(
                  'settings.aiService.profileSettings.resetToDefaults',
                  'Reset to defaults'
                )}
              </Button>
            </div>

            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 [&_input]:font-mono [&_input]:text-xs">
              <div>
                <Label htmlFor="profile_max_tokens">
                  {t(
                    'settings.aiService.profileSettings.maxTokens',
                    'Max tokens'
                  )}
                </Label>
                <Input
                  id="profile_max_tokens"
                  aria-invalid={numericFieldInvalid('max_tokens')}
                  aria-describedby={
                    numericFieldInvalid('max_tokens')
                      ? 'profile-numeric-error'
                      : undefined
                  }
                  className={
                    numericFieldInvalid('max_tokens')
                      ? 'border-destructive'
                      : undefined
                  }
                  type="number"
                  min={1}
                  step={1}
                  value={selectedProfileData.max_tokens ?? ''}
                  onChange={(e) =>
                    updateSelectedProfile({
                      max_tokens: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  inputMode="numeric"
                />
              </div>

              <div>
                <Label htmlFor="profile_timeout_seconds">
                  {t(
                    'settings.aiService.profileSettings.timeoutSeconds',
                    'Timeout seconds'
                  )}
                </Label>
                <Input
                  id="profile_timeout_seconds"
                  aria-invalid={numericFieldInvalid('timeout_seconds')}
                  aria-describedby={
                    numericFieldInvalid('timeout_seconds')
                      ? 'profile-numeric-error'
                      : undefined
                  }
                  className={
                    numericFieldInvalid('timeout_seconds')
                      ? 'border-destructive'
                      : undefined
                  }
                  type="number"
                  min={1}
                  step={1}
                  value={selectedProfileData.timeout_seconds ?? ''}
                  onChange={(e) =>
                    updateSelectedProfile({
                      timeout_seconds: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  inputMode="numeric"
                />
              </div>

              <div>
                <Label htmlFor="profile_reasoning_effort">
                  {t(
                    'settings.aiService.profileSettings.reasoningEffort',
                    'Reasoning effort'
                  )}
                </Label>
                <Select
                  value={selectedProfileData.reasoning_effort ?? '__default__'}
                  onValueChange={(value) =>
                    updateSelectedProfile({
                      reasoning_effort:
                        value === '__default__'
                          ? null
                          : (value as 'low' | 'high' | 'max'),
                    })
                  }
                >
                  <SelectTrigger id="profile_reasoning_effort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      {t(
                        'settings.aiService.profileSettings.default',
                        'Default'
                      )}
                    </SelectItem>
                    {(['low', 'high', 'max'] as const).map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {t(
                          `settings.aiService.reasoningEffort.${effort}`,
                          effort
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="profile_temperature">
                  {t(
                    'settings.aiService.profileSettings.temperature',
                    'Temperature'
                  )}
                </Label>
                <Input
                  id="profile_temperature"
                  aria-invalid={numericFieldInvalid('temperature')}
                  aria-describedby={
                    numericFieldInvalid('temperature')
                      ? 'profile-numeric-error'
                      : undefined
                  }
                  className={
                    numericFieldInvalid('temperature')
                      ? 'border-destructive'
                      : undefined
                  }
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={selectedProfileData.temperature ?? ''}
                  onChange={(e) =>
                    updateSelectedProfile({
                      temperature: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </div>
            </div>

            {selectedNumericIssues.length > 0 && (
              <p
                id="profile-numeric-error"
                role="alert"
                className="text-xs text-destructive"
              >
                {invalidParametersMessage}
              </p>
            )}
            <Collapsible
              open={selectedJsonIsInvalid || jsonOpen[selectedProfile] === true}
              onOpenChange={(open) =>
                setJsonOpen((previous) => ({
                  ...previous,
                  [selectedProfile]: open,
                }))
              }
              className="border-t border-border/80 pt-2"
            >
              <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-medium">
                <span className="flex min-w-0 items-center gap-1.5">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                  {t(
                    'settings.aiService.profileSettings.extraBodyJson',
                    'Extra request body JSON'
                  )}
                </span>
                <span
                  className={
                    selectedJsonIsInvalid
                      ? 'shrink-0 text-destructive'
                      : 'shrink-0 text-muted-foreground'
                  }
                >
                  {selectedJsonIsInvalid
                    ? t(
                        'settings.aiService.profileSettings.invalidJsonBadge',
                        'Invalid JSON'
                      )
                    : Object.keys(selectedProfileData.extra_body_json ?? {})
                          .length
                      ? t('settings.aiService.profileSettings.custom', 'Custom')
                      : t(
                          'settings.aiService.profileSettings.default',
                          'Default'
                        )}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Label htmlFor="profile_extra_body_json">
                  {t(
                    'settings.aiService.profileSettings.extraBodyJson',
                    'Extra request body JSON'
                  )}
                </Label>
                <Textarea
                  id="profile_extra_body_json"
                  aria-invalid={selectedJsonIsInvalid}
                  value={selectedJsonDraft}
                  onChange={(e) => {
                    const draft = e.target.value;
                    try {
                      const parsed = JSON.parse(draft) as unknown;
                      updateSelectedProfile({
                        extra_body_json:
                          typeof parsed === 'object' &&
                          parsed !== null &&
                          !Array.isArray(parsed)
                            ? (parsed as Record<string, unknown>)
                            : {},
                        extra_body_json_draft: draft,
                      });
                    } catch {
                      updateSelectedProfile({ extra_body_json_draft: draft });
                    }
                  }}
                  className="mt-1.5 font-mono text-xs"
                  rows={4}
                />
                <p
                  role={selectedJsonIsInvalid ? 'alert' : undefined}
                  className={`text-xs mt-1 ${
                    selectedJsonIsInvalid
                      ? 'text-destructive'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {selectedJsonIsInvalid
                    ? t(
                        'settings.aiService.profileSettings.invalidJson',
                        'Extra request body must be a valid JSON object.'
                      )
                    : t(
                        'settings.aiService.profileSettings.validJson',
                        'Valid JSON object'
                      )}
                </p>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) =>
            onFormDataChange({ is_active: checked })
          }
        />
        <Label htmlFor="is_active">
          {isEdit
            ? t(`${translationPrefix}.activeService`)
            : t(`${translationPrefix}.setAsActive`)}
        </Label>
      </div>

      <div
        data-testid="ai-service-form-actions"
        className="flex flex-wrap items-center justify-end gap-2 border-t pt-4 [&_button]:h-9 [&_button]:text-xs"
      >
        {onTestConnection && (
          // type="button" is critical — the test must not submit the form.
          // Disabled with the same guard as submit so a config the form would
          // reject can't be tested either.
          <Button
            type="button"
            variant="outline"
            onClick={() => onTestConnection(selectedModel ?? '')}
            disabled={
              loading ||
              testing ||
              invalidProfiles.length > 0 ||
              (modelOptions.length === 0 && !selectedModel) ||
              (requiresCustomUrl && !formData.custom_url?.trim())
            }
          >
            {testing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plug className="h-4 w-4 mr-2" />
            )}
            {testing
              ? t(`${translationPrefix}.testing`)
              : t(`${translationPrefix}.testConnection`)}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          <X className="h-4 w-4 mr-1.5" />
          {t(`${translationPrefix}.cancel`)}
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          {isEdit
            ? t(`${translationPrefix}.saveChanges`)
            : t(`${translationPrefix}.addService`)}
        </Button>
        {/* Inline result next to the button; hidden while a test is running. */}
        {onTestConnection && !testing && testStatus && (
          <span
            className={
              testStatus.state === 'success'
                ? 'w-full break-words text-xs font-medium text-green-600 dark:text-green-400'
                : 'w-full break-words text-xs font-medium text-destructive'
            }
          >
            {testStatus.state === 'success'
              ? t('settings.aiService.test.successTitle')
              : `${t('settings.aiService.test.failureTitle')}: ${testStatus.message}`}
          </span>
        )}
      </div>
    </form>
  );
};
