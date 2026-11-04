import { useEffect, useMemo, useRef, useState } from 'react';
import { discoverAIServiceModels } from '@/api/Settings/aiServiceSettingsService';
import type { AiServiceModelsRequest } from '@workspace/shared';
import { HttpApiError } from '@/api/api';

type DiscoveryFailure =
  | 'authentication'
  | 'unsupported'
  | 'rateLimit'
  | 'timeout'
  | 'configuration'
  | 'permission'
  | 'error';
const FAILURE_STATUS: Partial<Record<number, DiscoveryFailure>> = {
  400: 'configuration',
  401: 'authentication',
  403: 'permission',
  404: 'unsupported',
  405: 'unsupported',
  429: 'rateLimit',
  504: 'timeout',
};
const FAILURE_CODE: Record<string, DiscoveryFailure> = {
  ai_models_auth_failed: 'authentication',
  ai_models_unsupported: 'unsupported',
  ai_models_rate_limited: 'rateLimit',
  ai_models_timeout: 'timeout',
};

// Connection values rotate this token but are never retained in result state.
function discoveryContext(
  _connection: readonly (string | null | undefined)[]
): symbol {
  return Symbol();
}

export function useModelDiscovery(
  serviceId: string | undefined,
  serviceType: string | undefined,
  customUrl: string | null | undefined,
  apiKey: string | undefined
) {
  const generation = useRef(0);
  const context = useMemo(
    () => discoveryContext([serviceId, serviceType, customUrl, apiKey]),
    [serviceId, serviceType, customUrl, apiKey]
  );
  const [result, setResult] = useState<{
    context: typeof context;
    models: string[];
    status: 'idle' | 'pending' | 'empty' | DiscoveryFailure;
  }>({ context, models: [], status: 'idle' });
  // Do not retain provider errors or secrets in mutation results or query caches.
  useEffect(() => {
    generation.current += 1;
    return () => {
      generation.current += 1;
    };
  }, [context]);

  const fetchModels = async () => {
    if (serviceType !== 'openai_compatible') return;
    const current = ++generation.current;
    setResult({ context, models: [], status: 'pending' });
    const payload: AiServiceModelsRequest = {
      service_type: 'openai_compatible',
      ...(serviceId ? { id: serviceId } : {}),
      ...(customUrl !== undefined && customUrl !== null
        ? { custom_url: customUrl }
        : {}),
      ...(apiKey?.trim() ? { api_key: apiKey } : {}),
    };
    try {
      const result = await discoverAIServiceModels(payload);
      if (generation.current !== current) return;
      const ids = result.models
        .map(({ id }) => id)
        .sort((a, b) => {
          const left = a.toLowerCase();
          const right = b.toLowerCase();
          return left < right
            ? -1
            : left > right
              ? 1
              : a < b
                ? -1
                : a > b
                  ? 1
                  : 0;
        });
      setResult({
        context,
        models: ids,
        status: ids.length ? 'idle' : 'empty',
      });
    } catch (error) {
      if (generation.current !== current) return;
      const status =
        error instanceof HttpApiError
          ? (FAILURE_CODE[error.code ?? ''] ??
            FAILURE_STATUS[error.status] ??
            'error')
          : 'error';
      setResult({ context, models: [], status });
    }
  };
  return {
    models: result.context === context ? result.models : [],
    status: result.context === context ? result.status : 'idle',
    fetchModels,
  };
}
