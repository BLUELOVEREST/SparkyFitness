import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Loader2,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useModelDiscovery } from '@/hooks/AI/useModelDiscovery';

interface Props {
  serviceId?: string;
  serviceType?: string;
  customUrl?: string | null;
  apiKey?: string;
  value: string;
  onChange: (id: string) => void;
}

export function ModelDiscovery({
  serviceId,
  serviceType,
  customUrl,
  apiKey,
  value,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const { models, status, fetchModels } = useModelDiscovery(
    serviceId,
    serviceType,
    customUrl,
    apiKey
  );
  const filteredModels = models.filter((model) =>
    model.toLowerCase().includes(search.trim().toLowerCase())
  );
  const applyManualModel = () => {
    if (!manualDraft.trim()) return;
    onChange(manualDraft.trim());
    setOpen(false);
    setSearch('');
    setManual(false);
  };
  const errors: Record<string, string> = {
    authentication: t(
      'settings.aiService.discovery.authentication',
      'Authentication failed. Check your API key or provide your own key.'
    ),
    unsupported: t(
      'settings.aiService.discovery.unsupported',
      'Model discovery is unavailable for this service. Enter a model ID manually.'
    ),
    rateLimit: t(
      'settings.aiService.discovery.rateLimit',
      'The provider is rate limiting requests. Try again later or enter a model ID manually.'
    ),
    timeout: t(
      'settings.aiService.discovery.timeout',
      'Model discovery timed out. Try again or enter a model ID manually.'
    ),
    configuration: t(
      'settings.aiService.discovery.configuration',
      'Check the service URL and provide your own API key after changing the connection.'
    ),
    permission: t(
      'settings.aiService.discovery.permission',
      'Model discovery is not permitted for this service or network address.'
    ),
    error: t(
      'settings.aiService.discovery.error',
      'Models could not be loaded. Enter a model ID manually or try again.'
    ),
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {t('settings.aiService.discovery.modelId', 'Model ID')}
      </Label>
      <div className="flex flex-wrap gap-2">
        {models.length === 0 ? (
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 min-w-0 flex-1 font-mono text-xs"
            autoComplete="off"
          />
        ) : (
          <Popover
            open={open}
            onOpenChange={(nextOpen) => {
              setSearch('');
              setManual(false);
              setOpen(nextOpen);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                id={id}
                className="h-9 min-w-0 flex-1 justify-between gap-2 text-left font-mono text-xs"
                aria-label={t(
                  'settings.aiService.discovery.choose',
                  'Choose model'
                )}
                title={
                  value ||
                  t('settings.aiService.discovery.choose', 'Choose model')
                }
              >
                <span className="min-w-0 truncate">
                  {value ||
                    t('settings.aiService.discovery.choose', 'Choose model')}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] p-2"
              align="start"
            >
              {manual ? (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setManual(false);
                      setSearch('');
                    }}
                    className="h-8 text-xs"
                  >
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                    {t(
                      'settings.aiService.discovery.backToModels',
                      'Back to models'
                    )}
                  </Button>
                  <Label htmlFor={`${id}-manual`}>
                    {t(
                      'settings.aiService.discovery.manualModelId',
                      'Manual model ID'
                    )}
                  </Label>
                  <Input
                    id={`${id}-manual`}
                    autoFocus
                    value={manualDraft}
                    className="font-mono text-xs"
                    onChange={(event) => setManualDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyManualModel();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!manualDraft.trim()}
                    onClick={applyManualModel}
                    className="w-full"
                  >
                    {t(
                      'settings.aiService.discovery.useModelId',
                      'Use model ID'
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    aria-label={t(
                      'settings.aiService.discovery.search',
                      'Search models'
                    )}
                    placeholder={t(
                      'settings.aiService.discovery.search',
                      'Search models'
                    )}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.preventDefault();
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        list.current
                          ?.querySelector<HTMLButtonElement>('[role="option"]')
                          ?.focus();
                      }
                    }}
                  />
                  <div
                    ref={list}
                    role="listbox"
                    aria-label={t(
                      'settings.aiService.discovery.choose',
                      'Choose model'
                    )}
                    className="mt-2 max-h-60 overflow-y-auto"
                    onKeyDown={(event) => {
                      const options = Array.from(
                        event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          '[role="option"]'
                        )
                      );
                      const index = options.findIndex(
                        (option) => option === event.target
                      );
                      const next =
                        event.key === 'ArrowDown'
                          ? index + 1
                          : event.key === 'ArrowUp'
                            ? index - 1
                            : event.key === 'Home'
                              ? 0
                              : event.key === 'End'
                                ? options.length - 1
                                : null;
                      if (next !== null && options.length > 0) {
                        event.preventDefault();
                        options[
                          (next + options.length) % options.length
                        ]?.focus();
                      }
                    }}
                  >
                    {filteredModels.map((model) => (
                      <button
                        key={model}
                        type="button"
                        role="option"
                        aria-selected={model === value}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                        onClick={() => {
                          onChange(model);
                          setSearch('');
                          setOpen(false);
                        }}
                      >
                        <Check
                          aria-hidden="true"
                          className={`h-4 w-4 shrink-0 ${model === value ? '' : 'invisible'}`}
                        />
                        <span className="min-w-0 break-all">{model}</span>
                      </button>
                    ))}
                  </div>
                  {filteredModels.length === 0 && (
                    <p
                      role="status"
                      className="px-2 py-3 text-sm text-muted-foreground"
                    >
                      {t(
                        'settings.aiService.discovery.noMatches',
                        'No matching models.'
                      )}
                    </p>
                  )}
                  <div className="mt-1 border-t pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-full justify-start text-xs"
                      onClick={() => {
                        setManualDraft(value);
                        setManual(true);
                      }}
                    >
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      {t(
                        'settings.aiService.discovery.manual',
                        'Enter model ID manually'
                      )}
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOpen(false);
            setSearch('');
            void fetchModels();
          }}
          disabled={status === 'pending'}
          className="h-9 text-xs"
        >
          {status === 'pending' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {t('settings.aiService.discovery.fetch', 'Fetch models')}
        </Button>
      </div>
      {errors[status] && (
        <p role="status" className="text-sm text-destructive">
          {errors[status]}
        </p>
      )}
      {status === 'empty' && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            'settings.aiService.discovery.empty',
            'No models were returned. Enter a model ID manually.'
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          'settings.aiService.discovery.hint',
          'Enter any model ID or search fetched IDs. A listed model does not guarantee access or image support.'
        )}
      </p>
    </div>
  );
}
