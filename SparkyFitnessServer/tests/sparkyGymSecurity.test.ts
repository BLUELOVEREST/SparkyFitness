import { describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import {
  derivePairKeys,
  openSecrets,
  sealSecrets,
  signControlRequest,
  verifyControlRequest,
  verifyMediaPreflight,
  signResponse,
  verifyResponse,
} from '../integrations/opengym/security.js';

const id = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const token = Buffer.alloc(32, 7).toString('base64url');
const offer = {
  version: 1 as const,
  connection_id: id,
  sf_owner_ref: owner,
  sf_origin: 'https://fitness.example.com',
  peer_origin: 'https://gym.example.com',
  sf_nonce: token,
  secret: token,
  expires_at: '2026-10-29T20:00:00.000Z',
  scopes: ['body_measurement' as const, 'workout' as const],
  include_history: true,
};
const claim = {
  version: 1 as const,
  connection_id: id,
  sf_owner_ref: owner,
  og_owner_ref: 'gym-owner',
  sf_origin: offer.sf_origin,
  og_origin: offer.peer_origin,
  sf_nonce: token,
  og_nonce: Buffer.alloc(32, 8).toString('base64url'),
  scopes: offer.scopes,
  include_history: true,
};

describe('SparkyGym credential isolation', () => {
  it('derives distinct directional keys and binds both identities and origins', () => {
    const keys = derivePairKeys(offer, claim);
    expect(keys.outgoing.length).toBe(32);
    expect(keys.incoming.length).toBe(32);
    expect(keys.outgoing.equals(keys.incoming)).toBe(false);
    expect(derivePairKeys(offer, claim).root.equals(keys.root)).toBe(true);
    expect(() =>
      derivePairKeys(offer, { ...claim, sf_owner_ref: 'another' })
    ).toThrow();
    expect(() =>
      derivePairKeys(offer, {
        ...claim,
        og_origin: 'https://other.example.com',
      })
    ).toThrow();
    expect(
      derivePairKeys(offer, { ...claim, og_owner_ref: 'another' }).root.equals(
        keys.root
      )
    ).toBe(false);
  });

  it('encrypts with connection-bound authenticated context and rejects replacement', () => {
    const root = Buffer.alloc(32, 9);
    const secrets = {
      version: 1 as const,
      sf_nonce: token,
      invitation_secret: token,
    };
    const sealed = sealSecrets(id, secrets, root);
    expect(sealed.includes(token)).toBe(false);
    expect(openSecrets(id, sealed, root)).toEqual(secrets);
    expect(() => openSecrets(randomUUID(), sealed, root)).toThrow();
    expect(() => openSecrets(id, sealed, Buffer.alloc(32, 10))).toThrow();
    expect(() => openSecrets(id, `${sealed}x`, root)).toThrow();
    expect(() => sealSecrets(id, secrets, Buffer.alloc(31))).toThrow();
  });
});

describe('fixed-path authenticated control requests', () => {
  it('matches the independent cross-server control golden vector', () => {
    const vectorId = '22222222-2222-4222-8222-222222222222';
    expect(
      signControlRequest(
        'POST',
        '/api/integrations/v1/pair/claim',
        Buffer.from('{"a":1}'),
        `${vectorId}_og`,
        '1000',
        Buffer.alloc(32, 4),
        vectorId
      )
    ).toBe(
      'v1=f3e8415c8684a05875997f1906f0f61491dfbf723db1f546e802992ee5b677c3'
    );
  });
  const body = Buffer.from(JSON.stringify(claim));
  const key = Buffer.alloc(32, 11);
  const timestamp = '1793275200';
  const keyId = `${id}_sf`;
  const path = '/api/integrations/v1/pair/accept';
  it('binds body, method, approved path and freshness', () => {
    const signature = signControlRequest(
      'POST',
      path,
      body,
      keyId,
      timestamp,
      key,
      id
    );
    expect(
      verifyControlRequest(
        'POST',
        path,
        body,
        keyId,
        timestamp,
        signature,
        key,
        id,
        Number(timestamp)
      )
    ).toBe(true);
    expect(
      verifyControlRequest(
        'POST',
        path,
        Buffer.from('changed'),
        keyId,
        timestamp,
        signature,
        key,
        id,
        Number(timestamp)
      )
    ).toBe(false);
    expect(
      verifyControlRequest(
        'POST',
        path,
        body,
        keyId,
        timestamp,
        signature,
        key,
        id,
        Number(timestamp) + 301
      )
    ).toBe(false);
    expect(() =>
      signControlRequest(
        'POST',
        '/api/admin/delete',
        body,
        keyId,
        timestamp,
        key,
        id
      )
    ).toThrow();
    expect(() =>
      signControlRequest('GET', path, body, keyId, timestamp, key, id)
    ).toThrow();
  });
  it('authenticates the immutable request ID, preventing snapshot replay with a fresh UUID', () => {
    const other = randomUUID();
    const signature = signControlRequest(
      'POST',
      path,
      body,
      keyId,
      timestamp,
      key,
      id
    );
    expect(
      signControlRequest('POST', path, body, keyId, timestamp, key, other)
    ).not.toBe(signature);
    expect(
      verifyControlRequest(
        'POST',
        path,
        body,
        keyId,
        timestamp,
        signature,
        key,
        other,
        Number(timestamp)
      )
    ).toBe(false);
  });
  it('authenticates a declared media digest before accepting large frame bytes', () => {
    const mediaPath = '/api/integrations/v1/media';
    const signature = signControlRequest(
      'POST',
      mediaPath,
      body,
      keyId,
      timestamp,
      key,
      id
    );
    const input = {
      bodySha256: createHash('sha256').update(body).digest('hex'),
      keyId,
      timestamp,
      signature,
      requestId: id,
      secret: key,
      nowSeconds: Number(timestamp),
    };
    expect(verifyMediaPreflight(input)).toBe(true);
    expect(verifyMediaPreflight({ ...input, bodySha256: 'a'.repeat(64) })).toBe(
      false
    );
    expect(verifyMediaPreflight({ ...input, requestId: randomUUID() })).toBe(
      false
    );
    expect(verifyMediaPreflight({ ...input, bodySha256: undefined })).toBe(
      false
    );
  });
  it('authenticates receipt bytes, status and immutable request ID', () => {
    const response = Buffer.from('{"ok":true}');
    const signature = signResponse(id, 200, response, keyId, timestamp, key);
    expect(
      verifyResponse(
        id,
        200,
        response,
        keyId,
        timestamp,
        signature,
        key,
        Number(timestamp)
      )
    ).toBe(true);
    expect(
      verifyResponse(
        randomUUID(),
        200,
        response,
        keyId,
        timestamp,
        signature,
        key,
        Number(timestamp)
      )
    ).toBe(false);
    expect(
      verifyResponse(
        id,
        201,
        response,
        keyId,
        timestamp,
        signature,
        key,
        Number(timestamp)
      )
    ).toBe(false);
    expect(
      verifyResponse(
        id,
        200,
        Buffer.from('{"ok":false}'),
        keyId,
        timestamp,
        signature,
        key,
        Number(timestamp)
      )
    ).toBe(false);
    expect(
      verifyResponse(
        id,
        200,
        response,
        keyId,
        timestamp,
        signature,
        key,
        Number(timestamp) - 301
      )
    ).toBe(false);
  });
});
