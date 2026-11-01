# SparkyGym Acceptance Optimizations Implementation Plan

> Execute the user-approved follow-ups with focused tests and independent review. Preserve existing uncommitted LAN/history integration changes in both repositories.

**Goal:** Complete the accepted integration usability and body-data follow-ups without changing data ownership or synchronizing new domains.

**Architecture:** Keep the existing native event pipeline, source-owned records and private media archives. Add missing built-in measurement fields end-to-end. Expose already imported progress photos through authenticated owner access and normal photo views, not public uploads. Reuse native openGym workout actions; hints remain separate from native day notes and completed workouts. Connected settings use a summary with explicit setup/edit/re-pair disclosure; URL changes never silently overwrite signed bindings.

**Scope:** Built-in circumference alignment; imported progress photo display; openGym start-new-workout/rest ergonomics; planned rest versus no arrangement; connected-state disclosure in both apps. E-class analytics, video acceptance, image releases and production deployment remain excluded.

## Working Rules

- Existing uncommitted work belongs to the ongoing accepted integration; do not reset, overwrite or commit it wholesale.
- Use ownership-separated implementation tasks. Review patches and shared locale additions centrally; preserve all upstream non-English catalogs.
- Do not copy application code/media between repositories. No builds, pushes, tags, or production changes in this request.
- Database changes follow the migration/RLS/shared-schema/documentation checklist and require a verified local backup before applying to the test stack.
- Keep default UI styling and native actions. No marketing pages, explanatory feature text or new architecture for existing workflows.

## Tasks

- [x] A. Add six built-in circumference fields end-to-end, map all 18 to native OG metrics, retain persisted keys and unchanged body-fat calculations. Migration, security/shared contracts, feature guides and regression coverage updated.
- [x] B. Provide start-new-workout/rest actions and connected setup disclosure. Distinguish no arrangement from explicit SF or native rotation rest; preserve native routine context under a rest override. Independent same-day workouts, private notes and reminders remain unchanged.
- [x] C. Display existing ready imported daily progress photos read-only in SF web/mobile through owner-authenticated metadata/media APIs. No copied files, public paths, fake check-ins/workouts or invented comparison angles. Source removal is honored; existing event streams invalidate the gallery without polling.
- [x] D. Collapse established SF URL forms into connection summaries with explicit editing/cancel/re-pair confirmation. Pending setup remains recoverable, signed binding safeguards remain enforced, and changing the peer origin requires disconnect/new pairing.
- [x] E. Complete additive English/localized strings, documentation, affected package validation, focused regression tests and independent review. Preserve and explicitly report the two known upstream mobile Chinese placeholder failures.
- [x] F. Verify local backups, apply the migration through real server startup, mount latest source, and check both web apps at desktop/mobile widths. Record exact validation and remaining native-device limitations. No release or production deployment.

## Verification Gates

### Progress

- B implementation integrated from isolated OG dirty-baseline clone; 38 focused tests passed, then 30 passed after the duplicate empty-state review fix. No upstream translation replaced; two additive OG keys supplied in its 19 locale packs.
- D implementation complete pending final integration checks: owner status optionally exposes persisted self_origin, active/paused forms collapse, editing/cancel and explicit re-pair preserve binding safeguards. Web 8 tests, mobile 4 tests and server 17 tests passed. New tests caught and corrected a pending-invitation recovery gap. Peer origin changes still require explicit disconnect/new pairing under the unchanged protocol.
- Both local test environments backed up and checksum/list verified before schema application: private manifest `/tmp/sparkygym-source-preview-20261031/pre-acceptance-optimizations-backup.json`. Migration subsequently applied through real local server startup; isolated PostgreSQL regressions passed (25 tests). HTTP owner/access regressions passed (35 tests). Existing image tags and persistent data retained.

### Final Gates

- Body mappings: 18 native circumference metrics, unit correctness, nullable partial updates preserve other daily fields, deleted values do not resurrect.
- Photos: owner-only access, no public archive path, correct calendar date, no fake workouts/check-ins, existing archive visible, source removal honored.
- openGym: no plan differs from an explicit dated rest day; a logged workout never prevents starting another; native private notes/reminders unchanged by imported hints.
- Pairing: connected forms collapsed, explicit edit/cancel/re-pair, no credentials in rendered summaries, editing never silently mutates an active origin binding.
- No false green: record exact validation commands/results and separate known upstream failures from regressions.

## Completed Verification

- SF server and frontend: `pnpm run validate` passed. Shared: `pnpm run validate` passed.
- Circumference implementation: 183 server tests and 67 web tests passed in the implementation batches. Real startup/migration and isolated PostgreSQL suites passed 25 tests; HTTP owner/access suites passed 35 tests. Later combined web regression passed 56 tests across 9 suites. Counts overlap; do not add them as a unique total.
- SF mobile focused batches: 94 measurement API/form/report tests, 104 add-screen/summary/static-label tests, 34 photo/settings tests and 1 new event-invalidation test passed. Typecheck passed using `node --max-old-space-size=3072 node_modules/typescript/bin/tsc --noEmit`; full lint, Knip, format, generated resources, watch and native locale checks passed, with later edits also scoped-linted/formatted/typechecked. Earlier memory/crash runs are not counted as passing.
- Mobile `i18n:audit`: zero dynamic keys, missing static keys and new hardcoded strings. Still fails only on upstream `zh-Hans`/`zh-Hant` `recordActivity.program.paused` duplicate `done`; catalogs/audit were not altered to bypass this.
- OG complete frontend attempt: 548 of 553 files and 6580 of 6594 tests passed. The 14 failures were eight sandbox child-process checks plus six rest/empty-plan expectations. Restore native rest semantics and recheck all five failed files plus related tests outside the sandbox: 149 tests across 9 files passed. This is a complete first attempt plus targeted corrected reruns, not a fresh all-green complete run. An additional 48 rotation/helper regressions passed. Actual OG backend body regression passed 6 tests; all 18 native mappings and custom/unit boundaries covered. Locale parity (19 packs, 2604 keys) and strict source-string audit passed.
- Browser: 9 captures across 1360px desktop and 390px mobile widths, including SF summary/edit, existing photo gallery/private full viewer, OG home and connected account settings. Zero page runtime exceptions, failed source modules or horizontal page overflow. SF URLs and OG invitation form collapsed by default. Unrelated release notices dismissed only in the disposable browser profile. The only intentionally blocked write was OG's native `POST /api/media/missing`; no business edits were performed. Browser sessions cleaned up; official exercise media blocked from capture.
- Local runtime read-only check: six new database columns present, test weight still 83.7 kg, waist still null, three live imported workouts, one progress photo and active pairing retained. Verified pre-migration backups remain outside Git.
- Both previews require the base Compose file plus `compose.source-preview.yml` and `compose.acceptance-optimizations.yml`; deployment `README.source-preview.md` updated. Current image tags unchanged; mounted code is not a published release.

## Remaining Acceptance Boundaries

- User can review local web previews now. Native SF/openGym APKs were not built or installed; native-device visual acceptance remains pending a separately requested build.
- Training video acceptance and E-class analytics remain deferred as previously agreed. No new data domains, schedule-session association, reverse training ownership, commit, tag, push or production change were introduced.
