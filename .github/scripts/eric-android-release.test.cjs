const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const yaml = require("js-yaml");

const workflow = yaml.load(
  fs.readFileSync(path.join(__dirname, "../workflows/android.yml"), "utf8"),
);
const job = workflow.jobs["build-release-apk"];
const step = (name) => {
  const value = job.steps.find((candidate) => candidate.name === name);
  assert.ok(value, `missing step: ${name}`);
  return value;
};

test("Eric tags build phone and Wear OS release artifacts together", () => {
  assert.deepEqual(workflow.on.push.tags, ["v*-eric.*"]);
  assert.match(step("Build phone release APK").run, /:app:assembleRelease/);
  assert.match(step("Build phone release APK").run, /arm64-v8a/);
  assert.match(
    step("Build Wear OS release APK").run,
    /:wearos:assembleRelease/,
  );
  assert.match(step("Test Wear OS app").run, /:wearos:testDebugUnitTest/);
});

test("both modules receive the same private release signing settings", () => {
  for (const key of [
    "SPARKY_RELEASE_STORE_FILE",
    "SPARKY_RELEASE_KEY_ALIAS",
    "SPARKY_RELEASE_STORE_PASSWORD",
    "SPARKY_RELEASE_KEY_PASSWORD",
  ]) {
    assert.ok(job.env[key]);
    assert.equal(step("Build phone release APK").env?.[key], undefined);
    assert.equal(step("Build Wear OS release APK").env?.[key], undefined);
  }
  const signing = step("Configure shared release signing");
  assert.equal(signing.env.KEYSTORE_BASE64, "${{ secrets.KEYSTORE_BASE64 }}");
  assert.match(signing.run, /test -n "\$KEYSTORE_BASE64"/);
  assert.match(signing.run, /umask 077/);
  assert.ok(
    job.steps.indexOf(signing) >
      job.steps.indexOf(step("Generate production Android project")),
  );
});

test("published APKs must match the configured release key, not just each other", () => {
  const verify = step("Prepare and verify APK artifacts").run;
  assert.match(verify, /set -euo pipefail/);
  assert.match(verify, /keytool -exportcert/);
  assert.match(verify, /-storepass:env SPARKY_RELEASE_STORE_PASSWORD/);
  assert.match(verify, /test "\$PHONE_CERT" = "\$EXPECTED_CERT"/);
  assert.match(verify, /test "\$PHONE_CERT" = "\$WEAR_CERT"/);
  assert.match(verify, /wearos-release\.apk/);
  const release = step("Create GitHub Release");
  assert.match(release.with.files, /steps\.apk\.outputs\.name/);
  assert.match(release.with.files, /steps\.apk\.outputs\.wear_name/);
});
