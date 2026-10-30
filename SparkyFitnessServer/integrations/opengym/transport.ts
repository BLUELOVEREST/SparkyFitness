import dns from 'node:dns/promises';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { CONTROL_METHODS } from './security.js';

export interface PeerPolicy {
  allow_http?: boolean;
  allow_private_network?: boolean;
}
interface Address {
  address: string;
  family: number;
}
export interface PeerResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}
export class SparkyGymTransportError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const stripBrackets = (value: string) => value.replace(/^\[|\]$/g, '');

export function validatePeerOrigin(value: string, policy: PeerPolicy): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SparkyGymTransportError('invalid_peer_origin');
  }
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && policy.allow_http === true)) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (value !== url.origin && value !== `${url.origin}/`)
  )
    throw new SparkyGymTransportError('invalid_peer_origin');
  return url;
}

function addressAllowed(address: string, allowPrivate: boolean): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }
  if (
    parsed.kind() === 'ipv6' &&
    'isIPv4MappedAddress' in parsed &&
    parsed.isIPv4MappedAddress()
  )
    parsed = parsed.toIPv4Address();
  const normalized = parsed.toNormalizedString();
  if (
    normalized === '100.100.100.200' ||
    normalized === ipaddr.parse('fd00:ec2::254').toNormalizedString()
  )
    return false;
  const range = parsed.range();
  return (
    range === 'unicast' ||
    (allowPrivate &&
      ['private', 'loopback', 'uniqueLocal', 'carrierGradeNat'].includes(range))
  );
}

export async function resolvePeerAddress(
  url: URL,
  policy: PeerPolicy,
  lookup: (host: string) => Promise<Address[]> = (host) =>
    dns.lookup(host, { all: true, verbatim: true })
): Promise<Address> {
  const hostname = stripBrackets(url.hostname);
  const literalFamily = net.isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname);
  if (
    !addresses.length ||
    addresses.some(
      (row) =>
        !addressAllowed(row.address, policy.allow_private_network === true)
    )
  ) {
    throw new SparkyGymTransportError('peer_address_forbidden');
  }
  return addresses[0]!;
}

export async function requestPeer(input: {
  origin: string;
  policy: PeerPolicy;
  method: 'GET' | 'POST';
  path: string;
  body: Buffer;
  headers: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
}): Promise<PeerResponse> {
  input.signal?.throwIfAborted();
  if (
    (input.path === '/api/integrations/v1/events'
      ? 'POST'
      : CONTROL_METHODS.get(input.path)) !== input.method
  ) {
    throw new SparkyGymTransportError('invalid_peer_path');
  }
  const url = validatePeerOrigin(input.origin, input.policy);
  const timeoutMs = Math.min(300000, Math.max(1000, input.timeoutMs ?? 20000));
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const address = await Promise.race([
    resolvePeerAddress(url, input.policy),
    new Promise<never>((_resolve, reject) => {
      dnsTimer = setTimeout(
        () => reject(new SparkyGymTransportError('peer_dns_timeout')),
        timeoutMs
      );
    }),
  ]).finally(() => {
    if (dnsTimer) clearTimeout(dnsTimer);
  });
  input.signal?.throwIfAborted();
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers)) {
    const name = key.toLowerCase();
    if (
      name !== 'content-type' &&
      !/^x-sparkygym-(?:key-id|timestamp|signature|request-id|body-sha256)$/.test(
        name
      )
    ) {
      throw new SparkyGymTransportError('invalid_peer_header');
    }
    headers[name] = value;
  }
  headers['content-length'] = String(input.body.length);
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error?: Error, response?: PeerResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (response) resolve(response);
    };
    const lookup: net.LookupFunction = (_host, options, callback) => {
      if (options.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    };
    const req = (url.protocol === 'https:' ? https : http).request(
      url,
      {
        method: input.method,
        path: input.path,
        headers,
        lookup,
        agent: false,
        signal: input.signal,
      },
      (res) => {
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > (input.maxResponseBytes ?? 1048576)) {
            const error = new SparkyGymTransportError(
              'peer_response_too_large'
            );
            res.destroy(error);
            req.destroy(error);
            done(error);
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', (error) => done(error));
        res.on('end', () =>
          done(undefined, {
            status: res.statusCode ?? 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    const timer = setTimeout(
      () => req.destroy(new SparkyGymTransportError('peer_request_timeout')),
      timeoutMs
    );
    req.on('error', (error) => done(error));
    req.end(input.body);
  });
}
