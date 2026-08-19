import type { QueryResult } from 'pg';
import { defaultKeyHasher } from '@better-auth/api-key';
import { getSystemClient } from '../db/poolManager.js';

type ApiKeyRow = {
  id: string;
  reference_id: string;
  enabled: boolean | null;
  expires_at: Date | string | null;
};

type SystemClient = {
  query<T extends object>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
  release(): void;
};

export type ApiKeyVerificationResult =
  | {
      status: 'valid';
      userId: string;
      expiresAt: string | null;
    }
  | { status: 'invalid' }
  | { status: 'disabled' }
  | { status: 'expired' };

function normalizeExpiresAt(expiresAt: ApiKeyRow['expires_at']): string | null {
  if (!expiresAt) {
    return null;
  }
  if (expiresAt instanceof Date) {
    return expiresAt.toISOString();
  }
  return new Date(expiresAt).toISOString();
}

function isExpired(expiresAt: ApiKeyRow['expires_at']): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date(expiresAt).getTime() <= Date.now();
}

export async function verifyApiKeyReadOnly(
  apiKey: string
): Promise<ApiKeyVerificationResult> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    return { status: 'invalid' };
  }

  const hashedKey = await defaultKeyHasher(trimmedKey);
  const client = (await getSystemClient()) as SystemClient;
  try {
    const result = await client.query<ApiKeyRow>(
      `SELECT id, reference_id, enabled, expires_at
       FROM public.api_key
       WHERE key = $1
       LIMIT 1`,
      [hashedKey]
    );
    const row = result.rows[0];
    if (!row) {
      return { status: 'invalid' };
    }
    if (row.enabled === false) {
      return { status: 'disabled' };
    }
    if (isExpired(row.expires_at)) {
      return { status: 'expired' };
    }
    return {
      status: 'valid',
      userId: row.reference_id,
      expiresAt: normalizeExpiresAt(row.expires_at),
    };
  } finally {
    client.release();
  }
}
