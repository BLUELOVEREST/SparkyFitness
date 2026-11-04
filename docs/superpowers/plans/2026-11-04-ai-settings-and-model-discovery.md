# AI Settings and Model Discovery

## Approved Scope

Keep the existing provider and four-profile architecture. Clarify administrator
versus personal selection, copy profile parameters completely without exposing
administrator credentials, and switch back without deleting personal services.
Use the same model-discovery controls in administrator and personal forms.

## Execution

- [x] Server/shared: authenticated model discovery under the existing chat routes.
  POST `/api/chat/ai-service-settings/models` accepts optional stored `id`,
  `service_type: openai_compatible`, optional draft `custom_url` and `api_key`.
  Response is `{models: [{id: string}]}`. No database migration is required.
- [x] Respect owner/admin permissions, per-user configuration policy and existing
  AI outbound-network policy. Stored credentials cannot be sent to a changed URL;
  redirects, DNS, timeouts and response bounds must remain guarded.
- [x] Frontend: explicit model fetch, searchable IDs and manual fallback; no
  typing-triggered calls. Invalidate discovery on connection changes and ignore
  stale responses without clearing the saved model.
- [x] Frontend: actual selected-source summary, complete profile copying,
  non-destructive global selection and faithful editing of existing parameters.
- [x] Tests: owner/global-key protection, LAN policy, redirects and provider
  failures; full profile copy, retained personal services, race-safe model list.
- [x] Run affected validation and regression tests; report actual evidence and
  mobile compatibility. No commits, publication or service changes this round.

## Compatibility

Existing service records, selected-service pointers and API clients remain valid.
Do not add automatic cross-record parameter inheritance. Vision selection keeps
its existing independent routing and is explained rather than silently changed.
A returned model ID does not prove invocation permission or vision support.

## Verification (2026-11-04)

- Shared `pnpm run validate`: passed after the final contract changes.
- Frontend `pnpm run validate`: passed (typecheck, ESLint, Prettier and Knip).
- Server `pnpm run validate`: passed after reasoning-effort forwarding.
- Frontend focused tests: 86 passed across four configuration/discovery suites;
  another 15 API and credential-redaction tests passed after the final edits.
- Server final discovery, route, repository and connection tests: 96 passed.
  The separate focused run including Swagger passed 101 tests across five files.
- Full server coverage attempt: 8,849 passed, 9 failed, 598 skipped, plus an
  authentication suite setup timeout. One discovery timeout-normalization gap
  was fixed and covered by the passing final focused tests. The remaining
  schema/rate-limit/Swagger timeout cases passed when their four files were
  rerun with one worker and 30-second test/hook limits (79 tests). This is not
  a passing full-coverage rerun.
- Full frontend coverage was stopped under resource pressure, not completed.
- Browser visual acceptance and live-provider model-list acceptance remain
  pending; the existing preview containers were not changed. No migration,
  mobile changes, commits, builds or deployments were performed.

## Local Preview and Follow-up

- The user subsequently requested a local preview. The existing test deployment
  now mounts the main workspace via `compose.preview-ai-settings.json`; its
  database dump was verified before switching. Production was not changed.
- Model selection follow-up: native `datalist` filters by its input's selected
  value, hiding alternatives on reopening. Replace only that interaction with
  the existing Popover primitive and independent search state. Each open starts
  with an empty query; manual model entry remains available. Keyboard navigation,
  reselection and connection-identity invalidation have regression coverage.
- Stitch layout was approved for the AI configuration area only. Project
  `13977975782254410059`, screen `4afcac187c6b40adbf05aa69a353f24b`
  (AI settings: personal/global), generated on 2026-11-04. Implementation follows
  `2026-11-04-ai-settings-approved-layout.md`; preserve the current page shell.
  Mock navigation, model recommendations and
  capability/context claims are not application requirements and must not be
  copied into implementation.
