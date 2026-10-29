import { describe, expect, it } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import {
  parseEvent,
  parseReceipt,
  signRequest,
  verifyRequest,
} from '../integrations/opengym/protocol.js';

const event = {
  version: 1,
  event_id: '11111111-1111-4111-8111-111111111111',
  connection_id: '22222222-2222-4222-8222-222222222222',
  producer: 'sparkyfitness',
  resource: 'body_measurement',
  entity_id: 'weight-1',
  revision: 1,
  operation: 'upsert',
  occurred_at: '2026-10-29T06:00:00.000Z',
  payload: { name: '体重', value: 75.2, unit: 'kg' },
};
const raw = Buffer.from(JSON.stringify(event));
const secret = Buffer.alloc(32, 7);
const keyId = 'key_1';
const timestamp = '1793253600';
const now = Number(timestamp);

describe('SparkyGym durable receipts', () => {
  it('accepts durable states but rejects unknown or incomplete receipts', () => {
    const receipt = {
      version: 1,
      event_id: event.event_id,
      status: 'applied',
      revision: 1,
    };
    for (const status of ['applied', 'duplicate', 'stale']) {
      expect(parseReceipt({ ...receipt, status })).toEqual({
        ...receipt,
        status,
      });
    }
    for (const patch of [
      { status: 'queued' },
      { revision: 0 },
      { extra: true },
      { version: 2 },
    ]) {
      expect(() => parseReceipt({ ...receipt, ...patch })).toThrow();
    }
    expect(() => parseReceipt(null)).toThrow();
  });
});

describe('SparkyGym event envelope', () => {
  it('accepts a body event without changing its JSON', () => {
    expect(parseEvent(raw)).toEqual(event);
  });

  it.each([
    { revision: 0 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { version: 2 },
    { event_id: 'not-a-uuid' },
    { occurred_at: '2026-02-30T06:00:00.000Z' },
    { occurred_at: '2026-10-29T06:00:00+00:00' },
    { entity_id: '\n' },
    { entity_id: 'x'.repeat(201) },
    { producer: 'opengym' },
    { resource: 'statistics' },
    { payload: null },
    { payload: [] },
    { extra: true },
    { user_id: 'untrusted-user' },
    { operation: 'delete' },
  ])('rejects an invalid or out-of-scope envelope: %j', (patch) => {
    expect(() =>
      parseEvent(Buffer.from(JSON.stringify({ ...event, ...patch })))
    ).toThrow();
  });

  it('accepts the training direction and explicit tombstones', () => {
    const training = { ...event, producer: 'opengym', resource: 'workout' };
    expect(parseEvent(Buffer.from(JSON.stringify(training)))).toEqual(training);
    const deletion = { ...training, operation: 'delete', payload: null };
    expect(parseEvent(Buffer.from(JSON.stringify(deletion)))).toEqual(deletion);
  });

  it('rejects invalid UTF-8, nonfinite JSON and oversized bodies', () => {
    expect(() => parseEvent(Buffer.from([0xff]))).toThrow();
    expect(() =>
      parseEvent(Buffer.from(JSON.stringify(event).replace('75.2', '1e999')))
    ).toThrow();
    expect(() => parseEvent(Buffer.alloc(1_048_577))).toThrow();
  });
});

describe('SparkyGym request signatures', () => {
  it('signs exact UTF-8 bytes and verifies within the inclusive skew window', () => {
    const signature = signRequest(raw, keyId, timestamp, secret);
    expect(signature).toBe(
      'v1=f4312fefbcbc2841c9094db274625c855e533e2bbb5ff93ee607b34dc89a42b9'
    );
    expect(signature).toMatch(/^v1=[a-f0-9]{64}$/);
    for (const offset of [-300, 0, 300]) {
      expect(
        verifyRequest(raw, keyId, timestamp, signature, secret, now + offset)
      ).toBe(true);
    }
    for (const offset of [-301, 301]) {
      expect(
        verifyRequest(raw, keyId, timestamp, signature, secret, now + offset)
      ).toBe(false);
    }
  });

  it('rejects a valid MAC for a different path or HTTP method', () => {
    for (const [method, path] of [
      ['GET', '/api/integrations/v1/events'],
      ['POST', '/api/data'],
    ]) {
      const input = [
        'sparkygym-v1',
        method,
        path,
        timestamp,
        keyId,
        createHash('sha256').update(raw).digest('hex'),
      ].join('\n');
      const signature = `v1=${createHmac('sha256', secret).update(input).digest('hex')}`;
      expect(verifyRequest(raw, keyId, timestamp, signature, secret, now)).toBe(
        false
      );
    }
  });

  it('binds body, timestamp, key ID and key bytes', () => {
    const signature = signRequest(raw, keyId, timestamp, secret);
    expect(
      verifyRequest(
        Buffer.from(`${raw.toString()} `),
        keyId,
        timestamp,
        signature,
        secret,
        now
      )
    ).toBe(false);
    expect(verifyRequest(raw, 'other', timestamp, signature, secret, now)).toBe(
      false
    );
    expect(
      verifyRequest(raw, keyId, String(now + 1), signature, secret, now)
    ).toBe(false);
    expect(
      verifyRequest(raw, keyId, timestamp, signature, Buffer.alloc(32, 8), now)
    ).toBe(false);
  });

  it.each([
    undefined,
    '',
    'v1=00',
    'v2=' + 'a'.repeat(64),
    'v1=' + 'A'.repeat(64),
  ])('rejects malformed signature %s', (signature) => {
    expect(verifyRequest(raw, keyId, timestamp, signature, secret, now)).toBe(
      false
    );
  });

  it('fails closed on invalid time, key framing and key size', () => {
    const signature = signRequest(raw, keyId, timestamp, secret);
    expect(verifyRequest(raw, keyId, 'NaN', signature, secret, now)).toBe(
      false
    );
    expect(verifyRequest(raw, keyId, timestamp, signature, secret, NaN)).toBe(
      false
    );
    expect(
      verifyRequest(raw, 'key\n1', timestamp, signature, secret, now)
    ).toBe(false);
    expect(
      verifyRequest(raw, keyId, timestamp, signature, Buffer.alloc(0), now)
    ).toBe(false);
    expect(() =>
      signRequest(raw, keyId, timestamp, Buffer.alloc(31))
    ).toThrow();
  });
});
