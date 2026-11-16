const { test } = require('node:test');
const assert = require('node:assert/strict');
const { certificateDigest } = require('./apk-certificate-digest.cjs');
const digest = 'a'.repeat(64);

for (const prefix of ['Signer #1', 'Signer (minSdkVersion=26, maxSdkVersion=32)', 'V3.0 Signer:', 'V3.1 Signer:']) {
  test(`reads ${prefix}`, () => {
    assert.equal(certificateDigest(`${prefix} certificate SHA-256 digest: ${digest}`), digest);
  });
}
test('accepts the same certificate across schemes and SDK ranges', () => {
  assert.equal(certificateDigest(`Signer #1 certificate SHA-256 digest: ${digest}\nV3.0 Signer: certificate SHA-256 digest: ${digest.toUpperCase()}`), digest);
});
test('does not accept a public key or source stamp instead of a signer certificate', () => {
  assert.throws(() => certificateDigest(`Signer #1 public key SHA-256 digest: ${digest}\nSource Stamp Signer certificate SHA-256 digest: ${digest}`));
});
test('rejects malformed certificate digests', () => {
  assert.throws(() => certificateDigest('Signer #1 certificate SHA-256 digest: wrong'));
});
test('rejects different certificates even across SDK ranges', () => {
  assert.throws(() => certificateDigest(`Signer (minSdkVersion=26, maxSdkVersion=32) certificate SHA-256 digest: ${digest}\nSigner (minSdkVersion=33, maxSdkVersion=99) certificate SHA-256 digest: ${'b'.repeat(64)}`));
});
