const fs = require('node:fs');

function certificateDigest(output) {
  const digests = new Set();
  for (const line of output.split(/\r?\n/)) {
    if (!/^(?:Signer (?:#\d+|\([^)]*\))|V\d+(?:\.\d+)* Signer:) certificate SHA-256 digest:/.test(line)) {
      continue;
    }
    const digest = line.slice(line.lastIndexOf(':') + 1).trim();
    if (!/^[a-fA-F0-9]{64}$/.test(digest)) {
      throw new Error('APK signer certificate SHA-256 digest is malformed');
    }
    digests.add(digest.toLowerCase());
  }
  if (digests.size !== 1) {
    throw new Error(`Expected one distinct APK signing certificate; found ${digests.size}`);
  }
  return [...digests][0];
}

module.exports = { certificateDigest };

if (require.main === module) {
  try {
    console.log(certificateDigest(fs.readFileSync(0, 'utf8')));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
