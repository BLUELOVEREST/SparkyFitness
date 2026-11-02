# Eric Android Release Signing

## Decision

On 2026-11-02 the owner approved switching both the phone APK and the new Wear OS APK to one formal release certificate, accepting that the old phone installation may require uninstall/reinstall. The GitHub build repository is `BLUELOVEREST/SparkyFitness`; Gitea continues building frontend/server images. No build is triggered by this document or by configuring Secrets.

The Wear OS Data Layer requires matching application IDs and signing certificates. Keep the production package identity unchanged. The phone build remains arm64-v8a; the watch is a separate `:wearos:assembleRelease` APK. Native sources come from `SparkyFitnessMobile/targets/wearos` through `plugins/withWearOs.ts`, not edits in generated Android directories.

## Private Credentials

The persistent signing directory on the development host is `$HOME/.local/share/eric-sparkyfitness-signing/` (directory 0700, private files 0600):

- `android-release.p12`: RSA-3072 release keystore.
- `signing.private.json`: local alias/password recovery metadata. Never print or commit it.
- `certificate-sha256.txt`: public certificate fingerprint.

GitHub Actions Secrets: `KEYSTORE_BASE64`, `RELEASE_KEY_ALIAS`, `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_PASSWORD`. All four were provisioned and their presence checked. The private signing directory must be retained independently of repository cleanup and test-data deletion. Do not regenerate the key for later versions: doing so would break upgrade installation again. Arrange a separate secure credential backup before replacing this development host.

## Build Contract

`.github/workflows/android.yml` runs on Eric tags or manual dispatch, installs the shared key after Expo prebuild, tests the Wear OS module, builds both APKs and verifies both APK certificates against the configured keystore. Missing signing configuration fails explicitly; never silently fall back to a debug certificate. APKs share the release tag, with `arm64-release.apk` and `wearos-release.apk` suffixes. No local APK compilation is required for this merge.

Before installing the first newly signed phone APK, synchronize or export unsent local data. Uninstalling the old app clears its login/server configuration and local-only state, but does not delete data already stored on SparkyFitness. Subsequent releases must reuse this same certificate.
