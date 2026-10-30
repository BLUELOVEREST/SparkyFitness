import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import {
  sparkyGymInvitationOfferSchema,
  sparkyGymPairClaimSchema,
  type SparkyGymInvitationOffer,
  type SparkyGymPairClaim,
} from '@workspace/shared';

const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const uuid = z.uuid();
const keyPattern = /^[A-Za-z0-9_-]{1,64}$/;
const signaturePattern = /^v1=[a-f0-9]{64}$/;
const timePattern = /^(0|[1-9]\d{0,15})$/;
const MAX_FRAME_BYTES = 104857600 + 65540;
const secretsSchema = z
  .object({
    version: z.literal(1),
    sf_nonce: token,
    og_nonce: token.optional(),
    invitation_secret: token.optional(),
    root_key: token.optional(),
    outgoing_key: token.optional(),
    incoming_key: token.optional(),
    revocation_receipt: z
      .object({
        request_id: uuid,
        body_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        incoming_key: token,
        outgoing_key: token,
      })
      .strict()
      .optional(),
  })
  .strict();
const sealedSchema = z
  .object({
    version: z.literal(1),
    iv: z.string(),
    tag: z.string(),
    data: z.string(),
  })
  .strict();
export type SparkyGymSecrets = z.infer<typeof secretsSchema>;

export const CONTROL_METHODS = new Map([
  ['/api/integrations/v1/pair/claim', 'POST'],
  ['/api/integrations/v1/pair/accept', 'POST'],
  ['/api/integrations/v1/capabilities', 'GET'],
  ['/api/integrations/v1/snapshot', 'POST'],
  ['/api/integrations/v1/media', 'POST'],
  ['/api/integrations/v1/revoke', 'POST'],
]);

function encryptionRoot(): Buffer {
  const raw = process.env.SPARKY_FITNESS_API_ENCRYPTION_KEY;
  const key =
    raw && /^[a-f0-9]{64}$/i.test(raw)
      ? Buffer.from(raw, 'hex')
      : Buffer.from(raw || '', 'base64');
  if (key.length !== 32) throw new Error('integration_encryption_unavailable');
  return key;
}

function localKey(root: Buffer): Buffer {
  if (!Buffer.isBuffer(root) || root.length !== 32)
    throw new Error('invalid_encryption_root');
  return Buffer.from(
    hkdfSync('sha256', root, Buffer.alloc(0), 'sparkygym-credentials-v1', 32)
  );
}

export function sealSecrets(
  connectionId: string,
  value: SparkyGymSecrets,
  root = encryptionRoot()
): string {
  uuid.parse(connectionId);
  const parsed = secretsSchema.parse(value);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', localKey(root), iv);
  cipher.setAAD(Buffer.from(`sparkygym-credentials-v1:${connectionId}`));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(parsed), 'utf8'),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: data.toString('base64url'),
  });
}

export function openSecrets(
  connectionId: string,
  value: string,
  root = encryptionRoot()
): SparkyGymSecrets {
  uuid.parse(connectionId);
  const sealed = sealedSchema.parse(JSON.parse(value));
  const iv = Buffer.from(sealed.iv, 'base64url');
  const tag = Buffer.from(sealed.tag, 'base64url');
  if (iv.length !== 12 || tag.length !== 16)
    throw new Error('invalid_encrypted_credentials');
  const decipher = createDecipheriv('aes-256-gcm', localKey(root), iv);
  decipher.setAAD(Buffer.from(`sparkygym-credentials-v1:${connectionId}`));
  decipher.setAuthTag(tag);
  const clear = Buffer.concat([
    decipher.update(Buffer.from(sealed.data, 'base64url')),
    decipher.final(),
  ]);
  return secretsSchema.parse(JSON.parse(clear.toString('utf8')));
}

export function derivePairKeys(
  offerValue: SparkyGymInvitationOffer,
  claimValue: SparkyGymPairClaim
) {
  const offer = sparkyGymInvitationOfferSchema.parse(offerValue);
  const claim = sparkyGymPairClaimSchema.parse(claimValue);
  if (
    offer.connection_id !== claim.connection_id ||
    offer.sf_owner_ref !== claim.sf_owner_ref ||
    offer.sf_origin !== claim.sf_origin ||
    offer.peer_origin !== claim.og_origin ||
    offer.sf_nonce !== claim.sf_nonce ||
    offer.include_history !== claim.include_history ||
    JSON.stringify(offer.scopes) !== JSON.stringify(claim.scopes)
  )
    throw new Error('pair_claim_mismatch');
  const salt = createHash('sha256')
    .update(`${claim.sf_nonce}.${claim.og_nonce}`)
    .digest();
  const context = [
    'sparkygym-pair-v1',
    claim.connection_id,
    claim.sf_owner_ref,
    claim.og_owner_ref,
    claim.sf_origin,
    claim.og_origin,
  ].join('\n');
  const root = Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(offer.secret, 'base64url'),
      salt,
      context,
      32
    )
  );
  return {
    root,
    outgoing: createHmac('sha256', root)
      .update('sparkyfitness-to-opengym')
      .digest(),
    incoming: createHmac('sha256', root)
      .update('opengym-to-sparkyfitness')
      .digest(),
  };
}

function validTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    timePattern.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}

function mac(
  fields: string[],
  body: Buffer,
  keyId: string,
  timestamp: string,
  secret: Buffer
): string {
  if (!Buffer.isBuffer(body) || body.length > MAX_FRAME_BYTES)
    throw new Error('invalid_signing_inputs');
  return macDigest(
    fields,
    createHash('sha256').update(body).digest('hex'),
    keyId,
    timestamp,
    secret
  );
}

function macDigest(
  fields: string[],
  digest: string,
  keyId: string,
  timestamp: string,
  secret: Buffer
): string {
  if (
    !/^[a-f0-9]{64}$/.test(digest) ||
    typeof keyId !== 'string' ||
    !keyPattern.test(keyId) ||
    !validTime(timestamp) ||
    !Buffer.isBuffer(secret) ||
    secret.length !== 32
  )
    throw new Error('invalid_signing_inputs');
  return `v1=${createHmac('sha256', secret)
    .update([...fields, timestamp, keyId, digest].join('\n'))
    .digest('hex')}`;
}

function verify(
  expected: () => string,
  timestamp: string | undefined,
  signature: string | undefined,
  nowSeconds: number
): boolean {
  if (
    !validTime(timestamp) ||
    typeof signature !== 'string' ||
    !signaturePattern.test(signature) ||
    !Number.isSafeInteger(nowSeconds) ||
    nowSeconds < 0 ||
    Math.abs(nowSeconds - Number(timestamp)) > 300
  )
    return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected().slice(3), 'hex'),
      Buffer.from(signature.slice(3), 'hex')
    );
  } catch {
    return false;
  }
}

export function signControlRequest(
  method: string,
  path: string,
  body: Buffer,
  keyId: string,
  timestamp: string,
  secret: Buffer,
  requestId: string
): string {
  uuid.parse(requestId);
  if (CONTROL_METHODS.get(path) !== method)
    throw new Error('invalid_control_path');
  return mac(
    ['sparkygym-control-v1', method, path, requestId],
    body,
    keyId,
    timestamp,
    secret
  );
}

export function verifyControlRequest(
  method: string,
  path: string,
  body: Buffer,
  keyId: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: Buffer,
  requestId: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return verify(
    () =>
      signControlRequest(
        method,
        path,
        body,
        keyId || '',
        timestamp || '',
        secret,
        requestId || ''
      ),
    timestamp,
    signature,
    nowSeconds
  );
}

/** Verify header authority before buffering a large personal-media frame. */
export function verifyMediaPreflight(input: {
  bodySha256: string | undefined;
  keyId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  requestId: string | undefined;
  secret: Buffer;
  nowSeconds?: number;
}): boolean {
  return verify(
    () =>
      macDigest(
        [
          'sparkygym-control-v1',
          'POST',
          '/api/integrations/v1/media',
          uuid.parse(input.requestId),
        ],
        input.bodySha256 || '',
        input.keyId || '',
        input.timestamp || '',
        input.secret
      ),
    input.timestamp,
    input.signature,
    input.nowSeconds ?? Math.floor(Date.now() / 1000)
  );
}

export function signResponse(
  requestId: string,
  status: number,
  body: Buffer,
  keyId: string,
  timestamp: string,
  secret: Buffer
): string {
  uuid.parse(requestId);
  if (!Number.isInteger(status) || status < 100 || status > 599)
    throw new Error('invalid_response_status');
  return mac(
    ['sparkygym-response-v1', requestId, String(status)],
    body,
    keyId,
    timestamp,
    secret
  );
}

export function verifyResponse(
  requestId: string,
  status: number,
  body: Buffer,
  keyId: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return verify(
    () =>
      signResponse(
        requestId,
        status,
        body,
        keyId || '',
        timestamp || '',
        secret
      ),
    timestamp,
    signature,
    nowSeconds
  );
}
