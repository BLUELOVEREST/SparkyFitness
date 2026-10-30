# SparkyGym Development Progress

Date: 2026-10-30 (Asia/Shanghai).

## Current Integration Checkpoint

The owner approved the final note-style design and implementation. SparkyFitness
publishes dated focus/time-bucket/main/rest hints; openGym displays them without
routine prerequisites, private-note/reminder side effects or planned-session links.
Actual workouts use their own stable IDs and may occur multiple times on one day.
No meal-source picker and no replacement of openGym's native weekly model.

Execution plan: `2026-10-30-sparkygym-daily-hints-completion.md`. Incorrect reverse
schedule/native-occurrence work has been removed, preserving body, results and
media integration. Fresh final-scope evidence:

- SparkyFitness web: 253 suites / 2,182 tests passed. Mobile: 700 suites / 9,646
  tests passed. Server full coverage: 538 files / 6,663 tests passed; DB-dependent
  suites skipped there are covered separately below.
- Shared, server and web validation passed. Mobile generation, 4-GB-heap typecheck,
  lint, watch audit, Knip, native locales and formatting passed. The official
  zh-Hans/zh-Hant duplicated `done` placeholders still fail the mobile audit;
  preserve upstream catalogs and do not call full mobile validation green.
- Six real PostgreSQL files: 364 passed / 26 skipped. All migrations and RLS
  applied through normal server boot. Source-owned activity details check both
  individual exercise and whole-session parents, on OLD and NEW.
- openGym full API rerun: 827 passed, no failures. The previous pass had one
  local fetch failure; its 30-test file and the complete rerun both passed.
  MCP: 135 passed. Final frontend full rerun: 6,574 passed, no failures.
- Strict wire parity: 164 independent cases; contract/payload/protocol: 95 tests.
  openGym retained source heads, consent and SSE revocation: 24 focused tests.
- Real two-service checks passed: pairing, body corrections/custom hourly values,
  managed-write rejection, pause/resume, private media, history, future daily hints,
  source correction/inactivation, two independent same-day workouts, unchanged
  notes/reminders/meals, real API restart, revoke/retention and idempotent purge.
- Settings pages passed at 1280x900 and 390x844 in both apps with no console errors;
  future-date hint presentation passed at desktop/mobile widths without overflow.
  This settings-only check does not claim interactive diary read-only acceptance;
  source protections have separate UI unit and real-PG tests.
- Independent review findings on history consent, session-revoked SSE and preset-only
  activity details were fixed and reviewed again without remaining blockers.

Private reports/screenshots and disposable data are outside Git under
`/tmp/sparkygym-acceptance-20261029`. No production deployment was performed.
GitHub APK publishing, physical-phone acceptance and E-class analytics are deferred.

Migration checklist: all new tables have RLS, shared schemas and documentation.
The final preset-detail guard migration changes only an existing invoker trigger;
new RLS/table/Zod/API shapes are not applicable. User/security docs were updated,
normal startup applied it, and real-PG rejection tests passed. The schema backup
was not edited or regenerated.

## Earlier Checkpoint (Before Final-Scope Implementation)

The evidence below predates the final correction unless explicitly stated. It is
not final-release acceptance and must not be used to claim the current tree passes.

Implementation is present in both isolated worktrees. This is not yet a release:
native weekly-session configuration and final regression/release gates remain open.

- Real owner login, invitation claim and bilateral approval passed against PostgreSQL
  and SQLite; no mocked peer or production data was used.
- Eight extended checks passed: initial snapshots, body corrections and target weight,
  signed numeric hourly samples, old-client/body-write rejection, bidirectional pause
  and resume, private media archive/read protection, shared attachment retention, and
  explicit full-history snapshot without duplicate workouts.
- Twenty-two PostgreSQL checks passed across repository/RLS, snapshot rewind protection
  and native session totals. Session calories/time belong to the session, never a
  fabricated exercise or a guessed per-action allocation.
- Both connection-management pages passed at 1280x900 and 390x844, with screenshots.
- openGym full frontend regression passed: 6,566 tests; MCP: 135 tests. Its API
  regression passed 812 tests before the final consent/resume additions, which also
  passed focused checks. SparkyFitness full web regression passed 253 suites and
  2,182 tests. Server, shared and web validation passed before the final media fix.
- Real API restart, queued delivery, bilateral revoke and explicit purge acceptance
  passed. Purge removed imported native workouts, private bytes and retained raw
  payloads while preserving both applications' original owned records.
- Media deletion fault injection reproduced a missing directory-sync retry after
  an interrupted purge; the fix and deterministic offline announcement test passed
  nine focused checks. Final server validation is being rerun.
- Fixed an empty-snapshot cursor boundary and a fail-open media-GC state read found
  by acceptance. Final review also identified history-consent and revoke-receipt
  retirement edges; focused consent, rotation and service regressions passed.
- C milestone review found that combined routines must remain one session, not be
  exported as separate workouts. Explicit native session grouping, time, sport and
  main selection are now implemented. The owner confirmed independent same-day
  occurrences may reuse any template; future scheduled activation is excluded.
  Seven real API checks passed, including duplicate templates, same-bucket sessions,
  football, explicit main changes, stable IDs, timezone and template-only isolation.
  Desktop/mobile browser editing passed with four sessions and one main. Screenshot
  review found unstyled dark inputs; the control-style regression now passes and
  fresh screenshot verification is in progress.
- Nutrition linkage remains an explicit policy decision: the current meal form only
  selects active local plans, so inactive source summaries do not yet drive meals.
  A local/openGym nutrition-source selector has been explained to the owner; do not
  silently activate imported templates or change existing meals before confirmation.
- Final server full coverage run passed 532 files and 6,636 tests, with 14 files /
  464 tests skipped and one unchanged GPX performance assertion failing at 2,471 ms
  against a 2,000-ms bound under load. Its isolated coverage rerun passed all 36
  tests without changing production code or the assertion. This is not a clean
  full invocation. Latest shared and web full validation passed.
- Final openGym API regression after native schedule changes: 811 passed, 12 failed
  out of 823. Full frontend: 6,544 passed, 33 failed out of 6,577. Failures include
  real defensive-read/null-routine/offline/undo regressions as well as obsolete
  assertions. C edits are now frozen for the authority correction; none of these
  failures may be dismissed or hidden. Do not reuse pre-schedule passing results.
- Review found private archive retention after account deletion. A durable,
  non-cascading cleanup queue/trigger/worker is being implemented independently;
  migration, RLS, restart and fault acceptance are not yet declared complete.
- Mobile final full regression: 698 suites and 9,642 tests passed, with four failures
  in two script suites due to empty child-process output under the sandbox. Both
  suites rerun outside the sandbox passed all 42 tests. No production code or
  official translations changed to bypass those checks; this is not a claim of one
  clean full invocation. The accepted official Chinese placeholder audit failures
  remain unchanged.
- Physical phone offline/reconnect acceptance still needs an installed custom APK.
- Merge and build after acceptance are authorized; production deployment is not.
- openGym uses its own initial release `v1.4.3-eric.1`. Do not create an external
  repository without confirmation.
- 2026-10-30 publishing clarification: container images remain on Gitea and APK
  builds remain on GitHub. GitHub network recovery, openGym APK repository setup
  and APK publishing are explicitly deferred by the owner; do not retry GitHub or
  switch APK builds to Gitea in this round.

Evidence, dummy account credentials, database backups and screenshots stay outside
Git in the private `/tmp/sparkygym-acceptance-20261029/` fixture directory. The earlier
foundation checkpoints below are historical and do not describe current enablement.

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

## Native Storage Kernel and Architecture Review

- Audited the committed protocol foundation against the native-API requirement. It
  registers no routes, calls no whole-profile API and has no legacy fallback. Retain it.
- Superseded the hidden per-profile JSON journal proposal and removed its unimplemented
  test draft. Both architecture/roadmap copies now require native transactional storage.
- Implemented an isolated openGym SQLite kernel: profiles, owner-bound pending/active/
  revoked connections, durable entity revisions, outbox and inbox. Profile CAS and
  outgoing events commit together; incoming application and replay receipts commit
  together. No JSON serving fallback or dual-write exists in this module.
- The existing openGym profile document can be stored as JSON _inside_ SQL. This is
  business storage, not an external whole-profile integration API. Body domain tables
  and typed resource endpoints are subsequent work, not hidden profile metadata.
- Test-first verification covered missing implementation, HTTP opt-in and credential
  shape checks. Real subprocess SIGKILL tests cover both an interrupted receive and
  a completed profile/outbox commit; two database handles cover stale CAS rejection.
- Independent review found mutable callback envelopes, unobserved rejected promises
  and serialization-hook bypasses. Each was reproduced with a failing test and fixed;
  follow-up review reported no remaining actionable P1/P2 findings within kernel scope.
- Latest openGym test run: **45 passed** (20 native storage, 23 protocol, 2 existing
  durable-write regression tests). Latest SparkyFitness protocol run: **28 passed**.
- No full app suites or deployment image tests rerun for this unregistered kernel.
  Node 22.22.0 emits an experimental node:sqlite warning. Pin and verify the deployment
  runtime and SQLite binding before enabling SQL-backed application storage.

## Native openGym Server Cutover

- One-time verified private backup/import and resumable retirement implemented. The
  API now reads/writes profiles.sqlite, never retired JSON. Auth db.json stays in its
  original domain and is included with its recovery copy in migration snapshots.
- Server/admin/media reads, CAS writes, SQL-revision caches, Coach and MCP use the
  native source. Existing normal app synchronization keeps public _rev/_wid semantics.
- Account deletion persists an irreversible auth tombstone before cleanup, cancels
  Coach work, cascades SQL integration records, clears credentials/media and retries
  failed cleanup on startup. Directory durability barriers are strict and repeat on
  retry even when targets are already absent. Pending admins do not count as available.
- Updated Docker module copies, source guides, offline backup/restore procedures and
  retained the existing single-API Recreate deployment strategy.
- Final frozen-source API suite: **777 passed**, zero failures/skips. MCP: **131
  passed**, including five real-server E2E tests. Native module graph loading and both
  worktrees' diff checks passed. Fault injection reproduced directory-sync ordering,
  re-enable and cleanup-retry defects before fixes; all regressions now pass.
- Independent review reported no remaining P1/P2 findings in the agreed scope after
  the fixes. Final log: `/tmp/opengym-api-native-final-pass-20261029.log`.
- Runtime filesystem scan found old profile reads only in the one-time importer.
  Existing deployed data/services have not been touched.

## Deployment Boundary

Pairing/resource routes, encrypted credentials, transaction-captured outboxes, typed
body projections, native workout import, private media, SSE and initial history
transfer are enabled only in the disposable acceptance stack. Existing local-test
and production deployments remain unchanged. No release tag or build has yet been
published for this implementation checkpoint.

## Worktrees

- SparkyFitness: `/tmp/sparky-opengym-integration-20261029`,
  branch `codex/opengym-integration`.
- openGym: `/tmp/opengym-sparky-integration-20261029`,
  branch `codex/sparkyfitness-integration`.
- Original source workspaces remain on their previous branches with local files preserved.
- SparkyFitness validation reuses dependencies from the earlier v1.9.0 merge worktree
  through local ignored node_modules symlinks. These symlinks are not release artifacts.

## Next Checkpoint

Finish complete package validation, resolve remaining regression failures, verify
restart/revoke/purge behavior and review the actual diffs. Then merge the accepted
branches and publish coordinated artifacts using the approved per-project version
rules. Do not deploy production as part of this task. E-class analytics remain deferred.
