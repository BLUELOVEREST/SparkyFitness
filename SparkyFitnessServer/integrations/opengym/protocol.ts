import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  sparkyGymEventSchema,
  sparkyGymReceiptSchema,
  type SparkyGymEvent,
  type SparkyGymReceipt,
} from '@workspace/shared';

const MAX_BYTES = 1_048_576;

export function sameBodyDigest(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right))
    return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
const MAX_SKEW_SECONDS = 300;
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TIMESTAMP = /^(0|[1-9]\d{0,15})$/;
const SIGNATURE = /^v1=[a-f0-9]{64}$/;

function checkBody(body: Buffer): void {
  if (!Buffer.isBuffer(body) || body.length > MAX_BYTES) {
    throw new TypeError('Invalid event body');
  }
}

export function parseEvent(body: Buffer): SparkyGymEvent {
  checkBody(body);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  return sparkyGymEventSchema.parse(JSON.parse(text));
}

export function parseReceipt(value: unknown): SparkyGymReceipt {
  return sparkyGymReceiptSchema.parse(value);
}

function validTimestamp(value: string): boolean {
  return TIMESTAMP.test(value) && Number.isSafeInteger(Number(value));
}

export function signRequest(
  body: Buffer,
  keyId: string,
  timestamp: string,
  secret: Buffer
): string {
  checkBody(body);
  if (
    !KEY_ID.test(keyId) ||
    !validTimestamp(timestamp) ||
    !Buffer.isBuffer(secret) ||
    secret.length !== 32
  ) {
    throw new TypeError('Invalid signing inputs');
  }
  const digest = createHash('sha256').update(body).digest('hex');
  const canonical = [
    'sparkygym-v1',
    'POST',
    '/api/integrations/v1/events',
    timestamp,
    keyId,
    digest,
  ].join('\n');
  return `v1=${createHmac('sha256', secret).update(canonical).digest('hex')}`;
}

/** Authenticity only: the receiver still checks connection, scope and replay state. */
export function verifyRequest(
  body: Buffer,
  keyId: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (
    !keyId ||
    !timestamp ||
    !signature ||
    !SIGNATURE.test(signature) ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 0 ||
    !validTimestamp(timestamp) ||
    Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS
  ) {
    return false;
  }
  try {
    const expected = signRequest(body, keyId, timestamp, secret);
    return timingSafeEqual(
      Buffer.from(signature.slice(3), 'hex'),
      Buffer.from(expected.slice(3), 'hex')
    );
  } catch {
    return false;
  }
}
