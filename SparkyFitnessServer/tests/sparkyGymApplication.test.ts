import { describe, expect, it } from 'vitest';
import {
  classifyDeliveryFailure,
  parsePeerHeaders,
  publicConnectionState,
} from '../integrations/opengym/service.js';

describe('SparkyGym application boundaries', () => {
  it('requires directional keys, a UUID operation ID and bounded fresh timestamps before parsing bodies', () => {
    const id = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
    const headers = {
      keyId: `${id}_og`,
      requestId: id,
      timestamp: '1000',
      signature: `v1=${'a'.repeat(64)}`,
    };
    expect(
      parsePeerHeaders(headers, '/api/integrations/v1/events', 1000)
    ).toEqual(headers);
    expect(() =>
      parsePeerHeaders(
        { ...headers, keyId: id },
        '/api/integrations/v1/events',
        1000
      )
    ).toThrow();
    expect(() =>
      parsePeerHeaders(
        { ...headers, requestId: 'not-a-uuid' },
        '/api/integrations/v1/events',
        1000
      )
    ).toThrow();
    expect(() =>
      parsePeerHeaders(headers, '/api/integrations/v1/events', 1301)
    ).toThrow();
    expect(() =>
      parsePeerHeaders(
        { ...headers, timestamp: '0001000' },
        '/api/integrations/v1/events',
        1000
      )
    ).toThrow();
  });
  it('never acknowledges unsigned success or terminally discards unsigned validation responses', () => {
    expect(classifyDeliveryFailure(200, false)).toBe('retry');
    expect(classifyDeliveryFailure(400, false)).toBe('retry');
    expect(classifyDeliveryFailure(422, true)).toBe('terminal');
    expect(classifyDeliveryFailure(401, false)).toBe('pause');
    expect(classifyDeliveryFailure(503, true)).toBe('retry');
    expect(classifyDeliveryFailure(409, true)).toBe('pause');
  });
  it('does not represent pending bilateral activation as a confirmed active connection', () => {
    expect(publicConnectionState('activating', null)).toBe('pending_approval');
    expect(publicConnectionState('pending', new Date(0))).toBe('expired');
    expect(publicConnectionState('paused', new Date(0))).toBe('paused');
    expect(publicConnectionState('revoked', new Date(0))).toBe('revoked');
  });
});
