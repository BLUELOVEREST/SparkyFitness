# SparkyGym Development Progress

Date: 2026-10-29 (Asia/Shanghai).

## Completed Foundation

- Both repository baselines and upstream tracking inspected; openGym official upstream
  fetch configured and pushing to upstream disabled. Gitea remains origin.
- A-H ownership decisions documented; E analytics explicitly deferred.
- Architecture, versioned wire contract and six milestone implementation roadmap written.
- Independently implemented strict event envelope validation and directional resource
  ownership checks; shared SparkyFitness receipt schema and both receipt validators.
- Exact-byte HMAC-SHA256 request signing, fixed method/path binding, key framing,
  one-MiB body limit, UTF-8 validation and inclusive 300-second clock-skew checks.
- Test-first verification observed missing protocol implementations, then missing receipt
  implementations fail before adding them.
- Focused SparkyFitness suite: 28 tests passed. openGym Node suite: 21 tests passed
  outside sandbox (sandbox reports only a file-level result).
- Two independent validators agreed on 210 producer/resource/operation/payload cases.
- Both signatures match the same fixed synthetic UTF-8 golden vector.
- Shared, server and frontend full validation passed. Mobile first hit the default
  2-GB Node heap limit; with a 4-GB heap its generation checks, typecheck and lint passed.
  Mobile validation then failed on the known upstream zh-Hans/zh-Hant duplicated
  `done` placeholder in `recordActivity.program.paused`. Preserve those catalogs.
  Later commands in the chained mobile validation (watch audit, Knip, native locale
  and formatting checks) did not run; do not describe mobile validation as passing.
- Full application test suites and native compilation were not rerun for this
  additive, unregistered protocol foundation; focused tests are recorded above.

## Not Implemented or Enabled

No pairing UI or routes, persistent connections, SQL migrations, JSON event journal,
sender, inbox, resource payload handlers, body projection, workout import, media transfer,
SSE, source filtering or initial history transfer. No synchronization is active.
No production/test deployment change, tag, image build or APK build has been performed.

## Worktrees

- SparkyFitness: `/tmp/sparky-opengym-integration-20261029`,
  branch `codex/opengym-integration`.
- openGym: `/tmp/opengym-sparky-integration-20261029`,
  branch `codex/sparkyfitness-integration`.
- Original source workspaces remain on their previous branches with local files preserved.
- SparkyFitness validation reuses dependencies from the earlier v1.9.0 merge worktree
  through local ignored node_modules symlinks. These symlinks are not release artifacts.

## Next Checkpoint

Expand milestone 2 into an executable security/storage task plan, implement owner-approved
pairing and crash-safe inbox/outbox, then deliver the weight/target-weight vertical slice.
Do not add a webhook after a completed write and call it a reliable event queue.
