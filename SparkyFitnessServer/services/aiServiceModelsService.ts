import { z } from 'zod';
import {
  aiServiceModelsResponseSchema,
  type AiServiceModelsRequest,
  type AiServiceModelsResponse,
} from '@workspace/shared';
import chatRepository from '../models/chatRepository.js';
import {
  assertOutboundUrlShapeAndLiteralAllowed,
  createGuardedFetch,
  isOutboundUrlBlockedError,
  OutboundUrlShapeError,
  parseOutboundHttpUrl,
  resolveAiNetworkPolicy,
} from '../utils/outboundUrlPolicy.js';

const MAX_BODY_BYTES = 1024 * 1024;
const providerModelsSchema = z.object({
  data: aiServiceModelsResponseSchema.shape.models,
});

class DiscoveryError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
  }
}

function fail(
  statusCode: number,
  message: string,
  code?: string
): DiscoveryError {
  return new DiscoveryError(statusCode, message, code);
}

function isTimeout(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (
    typeof current === 'object' &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current);
    if (
      'name' in current &&
      ['TimeoutError', 'AbortError'].includes(String(current.name))
    )
      return true;
    if (
      'code' in current &&
      [
        'ETIMEDOUT',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_BODY_TIMEOUT',
      ].includes(String(current.code))
    )
      return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

// Compatible dispatch treats the supplied URL as a base, not a host that
// implicitly needs /v1. Preserve prefixes and accept a pasted completion URL.
function compatibleBase(raw: string): URL {
  const url = parseOutboundHttpUrl(raw);
  if (url.search)
    throw new OutboundUrlShapeError('Query strings are not allowed.');
  url.pathname = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '');
  return url;
}

async function readModels(
  response: Response
): Promise<AiServiceModelsResponse> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  if (!response.body) throw new Error('Missing response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('Response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const parsed = providerModelsSchema.parse(body);
  return {
    models: [...new Set(parsed.data.map(({ id }) => id))].map((id) => ({ id })),
  };
}

export async function discoverAiServiceModels(
  payload: AiServiceModelsRequest,
  userId: string,
  isAdmin: boolean
): Promise<AiServiceModelsResponse> {
  let customUrl = payload.custom_url?.trim();
  let apiKey = payload.api_key?.trim();
  try {
    if (payload.id) {
      const stored = await chatRepository.getAiServiceDiscoverySetting(
        payload.id,
        userId
      );
      if (!stored) throw fail(404, 'AI service setting not found.');
      if (
        (stored.is_public && !isAdmin) ||
        (!stored.is_public && stored.user_id !== userId)
      ) {
        throw fail(
          403,
          'AI service setting is not available for model discovery.'
        );
      }
      customUrl = customUrl ?? stored.custom_url?.trim() ?? undefined;
      if (!apiKey) {
        // Never decrypt a saved key for a changed provider or endpoint, even if
        // the new host would otherwise pass the outbound network policy.
        if (
          stored.service_type !== payload.service_type ||
          !stored.custom_url ||
          !customUrl ||
          compatibleBase(stored.custom_url).href !==
            compatibleBase(customUrl).href
        ) {
          throw fail(
            400,
            'Provide an API key after changing the provider or URL.'
          );
        }
        const decrypted = await chatRepository.getDecryptedAiServiceSettingById(
          payload.id,
          userId
        );
        // Recheck the credential's metadata in case the row changed meanwhile.
        if (
          !decrypted ||
          (decrypted.is_public && !isAdmin) ||
          (!decrypted.is_public && decrypted.user_id !== userId) ||
          decrypted.service_type !== payload.service_type ||
          !decrypted.custom_url ||
          compatibleBase(decrypted.custom_url).href !==
            compatibleBase(customUrl).href
        ) {
          throw fail(400, 'AI service setting changed. Please retry.');
        }
        apiKey = decrypted.api_key?.trim() || undefined;
      }
    }
    const base = compatibleBase(customUrl ?? '');
    const policy = await resolveAiNetworkPolicy({ source: 'user' }, isAdmin);
    assertOutboundUrlShapeAndLiteralAllowed(base.href, policy);
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/models`;
    try {
      const response = await createGuardedFetch(policy)(base.href, {
        method: 'GET',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const code =
          response.status === 401 || response.status === 403
            ? 'ai_models_auth_failed'
            : response.status === 404 || response.status === 405
              ? 'ai_models_unsupported'
              : response.status === 429
                ? 'ai_models_rate_limited'
                : undefined;
        if (code)
          throw fail(502, 'Unable to retrieve AI service models.', code);
        throw new Error('Provider request failed');
      }
      return await readModels(response);
    } catch (error) {
      if (error instanceof DiscoveryError) throw error;
      if (isOutboundUrlBlockedError(error)) {
        throw fail(403, 'AI service URL is not allowed by the network policy.');
      }
      if (isTimeout(error)) {
        throw fail(
          504,
          'AI service model discovery timed out.',
          'ai_models_timeout'
        );
      }
      throw fail(502, 'Unable to retrieve AI service models.');
    }
  } catch (error) {
    if (isOutboundUrlBlockedError(error)) {
      throw fail(403, 'AI service URL is not allowed by the network policy.');
    }
    if (error instanceof OutboundUrlShapeError) {
      throw fail(400, 'Invalid AI service URL.');
    }
    // Only our fixed messages may reach error middleware; never reflect raw
    // transport, database, or provider diagnostics (which can contain secrets).
    if (error instanceof DiscoveryError) throw error;
    throw fail(502, 'Unable to retrieve AI service models.');
  }
}
