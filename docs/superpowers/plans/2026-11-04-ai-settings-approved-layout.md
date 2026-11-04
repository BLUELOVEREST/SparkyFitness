# Approved AI Configuration Layout

**Goal:** Reproduce only the approved Stitch AI configuration area, retaining the
existing settings/admin page shell and all configuration behavior.

**Reference:** Stitch project `13977975782254410059`, screen
`4afcac187c6b40adbf05aa69a353f24b`. Downloaded HTML:
`/tmp/sf-ai-settings-approved-stitch.html`.

## Boundaries

- Keep navigation, routes, page headers, unrelated settings and AI routing rules.
- Reuse existing theme tokens, inputs, switches, tabs, disclosure primitives and
  icons. No hardcoded model recommendations, capability claims or sample values.
- Both administrator and personal service editors use the same compact layout.
- Keep full profile editing, validation, reset, manual model entry, discovery,
  connection tests, voice controls and preserved personal/global switching.
- The service-level prompt remains above and outside task tabs. Additional JSON
  is initially collapsed, but invalid drafts remain discoverable and block save.
- No server/mobile changes, migration, commit, build or production deployment.

## Tasks

- [x] Add regressions for common editor grouping, prompt-before-profile order,
  collapsed JSON editing and non-filtering model reselection.
- [x] Adapt `ServiceForm.tsx` and `ModelDiscovery.tsx`: compact connection grid,
  selected model trigger, independent popup search/manual entry, four task tabs,
  responsive parameter grid, JSON disclosure and single footer action group.
- [x] Adapt only AI source/service summaries in `GlobalOverrideBanner.tsx`,
  `ServiceListItem.tsx`, `UserServiceListItem.tsx` and `GlobalProfileSummary.tsx`.
  Preserve real selection/permission states; do not copy fictional surrounding UI.
- [x] Run focused tests, frontend validation and visual desktop/mobile checks
  against the existing local source preview. Record any remaining verification
  gaps and leave the implementation uncommitted for review.

## Acceptance Evidence

- Parent selection/source regression suite: 34 tests passed.
- Final shared form/model picker regressions: 50 tests passed across two suites.
  Frontend `pnpm run validate` passed (TypeScript, ESLint, Prettier and Knip).
  Changed-file lint/format checks and `git diff --check` passed as well.
- Playwright: actual shared components with synthetic configurations, personal
  and administrator editors at 1440px light and 390px dark (four cases).
  No runtime errors or document-width overflow; model reselection opens with an
  empty search, preserves alternatives and makes no additional model-list call.
  Report: `/tmp/sf-ai-layout-browser-results.json`; screenshots:
  `/tmp/sf-ai-layout-{personal,admin}-{desktop,mobile-dark}.png`.
- Temporary browser fixture files were removed after verification. No real
  account credentials or settings were changed by browser tests.
- Read-only review identified hidden invalid numeric values on inactive profile
  tabs. Shared-schema validation now checks all profiles, reveals the first
  invalid tab and labels the bad field. Reviewer confirmed the fix and found no
  further concrete regressions.
