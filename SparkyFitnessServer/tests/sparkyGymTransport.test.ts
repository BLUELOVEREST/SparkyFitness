import { describe, expect, it } from 'vitest';
import {
  validatePeerOrigin,
  resolvePeerAddress,
  requestPeer,
} from '../integrations/opengym/transport.js';

describe('SparkyGym peer destination policy', () => {
  it('honors an already aborted delivery without resolving or dialing a peer', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      requestPeer({
        origin: 'https://8.8.8.8',
        policy: {},
        method: 'GET',
        path: '/api/integrations/v1/capabilities',
        body: Buffer.alloc(0),
        headers: {},
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('requires independent explicit HTTP and private-address consent', async () => {
    expect(() =>
      validatePeerOrigin('http://192.168.200.118:3016', {
        allow_http: false,
        allow_private_network: true,
      })
    ).toThrow();
    const origin = validatePeerOrigin('http://192.168.200.118:3016', {
      allow_http: true,
      allow_private_network: true,
    });
    await expect(
      resolvePeerAddress(origin, { allow_private_network: true })
    ).resolves.toEqual({ address: '192.168.200.118', family: 4 });
    await expect(
      resolvePeerAddress(origin, { allow_private_network: false })
    ).rejects.toThrow();
    expect(() =>
      validatePeerOrigin('https://user:secret@example.com', {
        allow_http: false,
      })
    ).toThrow();
    expect(() =>
      validatePeerOrigin('https://example.com/api/health', {
        allow_http: false,
      })
    ).toThrow();
  });
  it('blocks metadata, multicast, link-local and unspecified addresses even with LAN consent', async () => {
    for (const address of [
      '169.254.169.254',
      '100.100.100.200',
      '0.0.0.0',
      '224.0.0.1',
      '[fe80::1]',
      '[::]',
      '[ff02::1]',
      '[fd00:ec2::254]',
    ]) {
      const origin = validatePeerOrigin(`https://${address}`, {
        allow_http: false,
      });
      await expect(
        resolvePeerAddress(origin, { allow_private_network: true })
      ).rejects.toThrow();
    }
  });
  it('validates every DNS result before pinning one, including mapped IPv4', async () => {
    const origin = validatePeerOrigin('https://peer.example.com', {
      allow_http: false,
    });
    await expect(
      resolvePeerAddress(origin, { allow_private_network: false }, async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '192.168.1.1', family: 4 },
      ])
    ).rejects.toThrow();
    await expect(
      resolvePeerAddress(origin, { allow_private_network: true }, async () => [
        { address: '::ffff:169.254.169.254', family: 6 },
      ])
    ).rejects.toThrow();
    await expect(
      resolvePeerAddress(origin, { allow_private_network: false }, async () => [
        { address: '8.8.8.8', family: 4 },
      ])
    ).resolves.toEqual({ address: '8.8.8.8', family: 4 });
  });
});
