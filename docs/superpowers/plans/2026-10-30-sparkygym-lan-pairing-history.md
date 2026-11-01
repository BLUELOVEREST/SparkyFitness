# LAN Pairing And On-Demand History

## Approved Scope

- Pair two explicit owners using LAN service origins, independently of browser/public origins.
- Fix the seven resource scopes and their existing producer directions; remove scope and network-policy controls from both UIs.
- Permit HTTP and private destinations for this integration only. Retain destination validation, metadata-address rejection, signature verification and bilateral owner approval.
- Authorize on-demand history at pairing but do not automatically queue full history on activation. Keep current-state initialization separate.
- Replace persistent history selection with an explicit confirmed history action. Preserve source/entity identity, version/source-cursor guards, membership reconciliation and media deduplication.
- Serialize snapshot requests and reject additional requests while a prior snapshot delivery is outstanding. Test retries, repeated completed imports and stale packets.
- No old-connection migration, production deployment, builds or automatic deletion of test data.

## Execution

1. Update SparkyFitness request contract to accept own LAN origin and peer LAN origin, deriving fixed scopes/network policy/history authorization on the server. Test contract rejection and invitation binding.
2. Separate history authorization from initial snapshot selection, including re-pairing. Retain old pending work until manual full reconciliation. Guard concurrent owner requests under existing locks and coalesce equivalent signed peer requests. Run source-head/snapshot replay regressions.
3. Simplify SparkyFitness UI to LAN addresses, invitation/approval and explicit history button. Test fixed payload, no removed controls and history confirmation.
4. Update openGym in an isolated worktree: use invitation LAN origins rather than public browser origin, server-owned policy, simplified import UI and serialized history action. Preserve independent authentication/CSRF origin checks. Add focused API/UI/store tests.
5. Review both changes against approved scope, run affected validation/tests and document any failures. Do not deploy or publish without a further request.

## Verification (2026-10-31)

- Implemented in both primary working directories; openGym changes were tested in `/tmp/opengym-lan-pairing-20261030` before applying the patch to its primary checkout. No commit, tag, build, pairing of actual accounts, test-stack replacement or production deployment was performed.
- SparkyFitness web: full validation passed; focused settings/API/hooks tests passed (8 tests).
- SparkyFitness server: validation passed; final focused service/payload/snapshot/projection tests passed (107 tests). The wider integration suite passed 204 tests before the final added rotation regression; guarded PostgreSQL fixture tests passed 24 tests after that regression and pending-snapshot coalescing changes.
- Real PostgreSQL checks cover repeated full-history imports preserving one workout/action/set, exact request replay, rejection of stale overwrites, completed snapshot retries, pending export coalescing and full-history acknowledgement before retiring old binding credentials. They ran only against the isolated `sparkygym_acceptance` fixture, not the user-facing test or production database.
- openGym primary checkout: 34 focused API/storage/network/media tests passed. Its changed frontend settings/client tests passed (8 tests) in the isolated worktree; the applied files match that reviewed patch.
- Mobile: focused owner-settings/API tests passed (6 tests); typecheck/lint, watch audit, Knip and native locale checks passed. Full validation still fails at the accepted upstream `zh-Hans`/`zh-Hant` duplicate `done` placeholders in `recordActivity.program.paused`; those official catalogs remain unchanged. An initial default-heap validation/coverage attempt exhausted memory; typecheck/lint were rerun with a larger heap and focused tests without whole-project coverage collection.
- Review found and fixed a rotation edge case: a delivered CURRENT snapshot cannot qualify as full-history supersession. Retirement now requires matching delivered begin/complete packets covering all outgoing resources and a completed full incoming snapshot where applicable. Verified against PostgreSQL as well as service tests.
