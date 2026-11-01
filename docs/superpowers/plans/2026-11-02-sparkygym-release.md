# SparkyGym Accepted Optimizations Release

Date: 2026-11-02 (Asia/Shanghai).

The user accepted the preceding local version and authorized committing, tagging
and triggering service-image and Android APK builds. Production deployment is a
separate step after the artifacts are available and backups are verified.

## Release Set

| Project | Tag | Service images | Android APK |
| --- | --- | --- | --- |
| SparkyFitness | `v1.9.0-eric.61` | Gitea frontend/server workflow | GitHub production ARM64 Release workflow |
| openGym | `v1.4.3-eric.3` | Gitea API/web workflow | GitHub signed Standard ARM64 Release workflow |

Each project's service and APK artifacts use the same immutable tag. The two
projects retain their separate Eric counters and development branches. Do not
push to official upstream repositories or overwrite previously published tags.

## Scope

- Fixed LAN pairing policy, explicit manual two-way history and durable deduplication.
- Eighteen built-in circumferences, including six new SF defaults and explicit
  native openGym mappings without persisted-field renames or body-fat changes.
- Existing private daily progress photos displayed read-only in SF web/mobile,
  with owner access checks and event-driven query invalidation.
- Clear openGym start-new-workout/rest actions, preserved multiple independent
  sessions, explicit native/SF rest versus no arrangement, and native rest context.
- Collapsed connected-state URL/invitation forms with intentional editing/re-pairing.

The proposed submodule/shared-backend architecture remains discussion only and
is not part of this release. E-class analytics and video acceptance remain deferred.

## Verification And Exclusions

The implementation closeout and earlier complete/targeted regression evidence are
recorded in `2026-10-31-sparkygym-acceptance-optimizations.md`. Release preflight
rechecks affected SF static validation, focused server/web/mobile regressions,
OG native body tests, locale parity and generated API documentation. CI remains
responsible for actual image/APK compilation and its configured full test gates.

Fresh preflight passed server/frontend/shared `pnpm run validate`, mobile
typechecking, 75 focused server tests, 18 focused web tests, 24 focused mobile
tests and 6 native OG body tests. OG locale/source-string audits and generated
API documentation checks also passed. These focused counts are not full-suite
totals, and no local release image or APK compilation was performed.

The old temporary OG acceptance clone was removed by the environment. Its previous
complete-suite results are historical evidence, not a fresh local full rerun.
The original SF mobile `zh-Hans`/`zh-Hant` duplicate `done` audit errors remain
unchanged; do not describe aggregate mobile validation as passing.

Do not include unrelated local ignore edits, screenshots, downloaded APKs, old
handoff documents, device firmware, local test configuration, credentials or
private backup/journal files. Existing production/test data are not changed by
the release operation. Native installation acceptance follows the new APK builds.
