# AI Settings Follow-up Fixes

User-approved scope: alphabetical discovered models, unsaved model connection
testing, missing Simplified Chinese translations, and explicit global-profile
default values. Preserve the accepted layout and all upstream translations.

- [x] Sort model IDs without changing selection, filtering or request frequency.
- [x] Reproduce connection failure and fix the actual provider request shape.
  Local logs show HTTP 400: `input.messages.0.content` must be a list; verify the
  newly selected model reaches the test request without saving.
- [x] Add only missing Simplified Chinese AI strings; preserve existing values.
- [x] Share profile-default resolution between server and read-only summary,
  displaying actual configured/default numbers, including service token fallback.
  Do not present provider/model-specific capability guarantees or expose JSON.
- [x] Run regression tests, package checks and local preview verification; retain
  current test data. No commit, publication, image build or production changes.

## Verification

- Frontend focused regressions: 92 tests passed across five suites.
- Final frontend full validation passed (typecheck, ESLint, Prettier and Knip).
- Provider dispatch/connection regressions: 182 tests passed; shared profile
  resolver regressions: seven tests passed. Server and shared validation passed.
- Saved authorized local compatible-provider configuration returned `ok: true`
  in a real short connection check. No credentials were printed or saved.
  The local test backend was restarted to load the fix; proxied health is UP.
- All 8,057 preexisting Simplified Chinese leaf values match HEAD exactly;
  79 lines were added and none removed. No AI translation keys are missing.
- Browser checks at 1440px and 390px passed using synthetic configurations:
  alphabetical options, selected draft model passed without saving, concrete
  translated summary values, no extra provider call or runtime errors/overflow.
  Report: `/tmp/sf-ai-followup-browser-results.json`. This host lacks Chinese
  fonts, so screenshot glyph appearance is not validated; translated DOM strings
  were checked against the actual Chinese catalog. Temporary fixtures removed.
- Mobile validation was attempted for the shared-library change but failed in
  typecheck because the local mobile dependencies/Expo TypeScript base are absent.
  No mobile source or API contracts changed; this is not a passing mobile check.
- Read-only review found no remaining concrete default-resolution regression.
  Legacy partial profile-option typing remains compatible.
