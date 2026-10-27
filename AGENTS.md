# AGENTS.md

*Last updated: 2026-10-27*

This is the repo-root monorepo guide for SparkyFitness. Use it to choose the right package, understand shared repo-level rules, and find the next guide to read.

**For AI Tools & Developers:** Start with `agent-docs/README.md` (in this repo) for quick navigation to:
- `file-and-domain-reference.md` — Find any code by feature in seconds
- `testing-patterns.md` — Concrete test examples for each layer
- `architecture-permissions.md` — Permission types and RLS patterns
- Plus 5 more guides for migrations, data flow, anti-patterns, new features, and planning

Package-level guides win. For work inside a package, follow that package's `AGENTS.md` when present, otherwise its `CLAUDE.md`.

## Scope

- Start here when work begins at repo root or spans multiple packages.
- Keep root-level guidance focused on workspace layout, shared conventions, and cross-package coordination.
- Root `package.json` is tooling only (`husky`, `lint-staged`, `prettier`), not an app entrypoint.
- Run scripts from the package directory you are changing.

## Package Guides

- Repo-root alias: `CLAUDE.md` points to this file.
- Frontend: `SparkyFitnessFrontend/AGENTS.md`
- Server: `SparkyFitnessServer/AGENTS.md`
- Mobile: `SparkyFitnessMobile/AGENTS.md`
- Shared: `shared/AGENTS.md`

For `docs/` and `SparkyFitnessGarmin/`, there is no package-level `AGENTS.md`. `SparkyFitnessGarmin/` is only a handful of Python files (`main.py`, `routes.py`, `service.py`, `schemas.py`); read them directly. For `docs/`, inspect the local manifest and content layout.

## Monorepo Map

- `SparkyFitnessFrontend/` - React 19 + Vite web app.
- `SparkyFitnessServer/` - Express 5 + PostgreSQL backend API.
- `SparkyFitnessMobile/` - Expo SDK 57 / React Native 0.86 app.
- `shared/` - source-first TypeScript workspace package for `@workspace/shared` schemas, constants, and timezone/day helpers.
- `docs/` - VitePress documentation site.
- `SparkyFitnessGarmin/` - standalone Python integration service outside the current `pnpm` workspace.
- `docker/`, `helm/`, `.github/` - infra and deployment assets.
- `umbrel/sparkyfitness/` - Umbrel App Store package (manifest, compose, derived secrets), submitted to `getumbrel/umbrel-apps`. See `umbrel/README.md`.
- `db_schema_backup.sql` - repo-root schema snapshot kept in sync by CI (`.github/workflows/schema-backup.yml`); never hand-edit or regenerate locally.
- `docker/.env.example` - tracked env template commonly copied to repo-root `.env`.

## Workspace Notes

- `pnpm-workspace.yaml` currently lists `frontend`, `SparkyFitnessFrontend`, `shared`, `SparkyFitnessMobile`, `SparkyFitnessServer`, and `docs`.
- Only `SparkyFitnessFrontend/` exists on disk right now; treat `frontend` as a legacy workspace entry unless the task is specifically about workspace cleanup.
- `shared/` is a library package, not an app; its `pnpm run validate` runs typecheck, a hardcoded-string audit, and the Prettier check. CI runs that in a `Shared Validate` job and also re-runs the frontend, mobile, and server jobs whenever `shared/` changes, so validate shared changes from the consuming package(s), not in isolation.
- `SparkyFitnessGarmin/` is outside the current workspace. Inspect its own manifest and scripts before working there.

## Eric Development, Releases, and Deployment

These fork-specific rules supplement the upstream package guides.

### Development and Upstream Merges

- The development mainline is `sparky-custom-eric-flow`, not the Git branch named `main`. Edit the upstream source packages directly; no `external/` checkout is required.
- Gitea `origin`: `https://gitea.blueloverest.site:44443/zhangzhicheng/eric-sparkyfitness.git`.
- GitHub APK remote: `git@github.com:BLUELOVEREST/SparkyFitness.git`. Official upstream: `https://github.com/CodeWithCJ/SparkyFitness.git`.
- Merge a selected official release tag in an isolated worktree and an upgrade branch based on the development mainline. Resolve conflicts and validate there before merging back into `sparky-custom-eric-flow`.
- Preserve Eric customizations, including carb-cycle planning, Grocy, added circumference fields, AI profiles, and hydration widgets. Adapt their implementation to upstream architecture, i18n, and build requirements.
- Preserve upstream translations. For Simplified Chinese translation conflicts, upstream text wins; custom translation enhancements supplement upstream text rather than replace existing translations. Do not use blanket whole-file "ours" conflict resolution.
- Preserve upstream translations, including official translation fixes. The user accepted the six known v1.8.0 German placeholder errors during that upgrade; v1.9.0 fixes those upstream, so retain the official fix.
- Known v1.9.0 mobile audit failure: `zh-Hans` and `zh-Hant` duplicate `done` in `recordActivity.program.paused`. Keep these official catalogs unchanged and report the failure; do not disable the audit or claim full mobile validation passes.
- Ask the user about unresolved semantic conflicts, data-model decisions, or removal of custom behavior. Routine adaptations to established upstream conventions can proceed.
- Run the affected packages' validation and tests, report remaining failures, and complete local acceptance before production deployment.

### Version and Build Rules

- Release tags use `v<upstream-version>-eric.<global-release-number>`, for example `v1.8.0-eric.58`.
- Increment the Eric release number for each new release; never reset it when the upstream version changes. Inspect existing local and remote tags before choosing the next number.
- Published tags are immutable. A fix gets a new tag rather than overwriting an existing release.
- Frontend, server, and APK artifacts belonging to one release use the same tag.
- Push the release tag to Gitea for frontend/server images and to GitHub for APK builds when those builds are requested. Check the workflows and confirm the pushes actually succeeded.
- Registry repositories are independent of the Git repository name: `192.168.200.101:54453/zhangzhicheng/sparkyfitness` (frontend) and `192.168.200.101:54453/zhangzhicheng/sparkyfitness-server` (server).
- Gitea builds the container images; local and production machines pull and run those images. Do not start expensive local APK builds unless requested.

### Local Test Environment

- Deployment directory: `/home/zhangzhicheng/workspace/own/eric-sparkyfitness-test`.
- Compose project name: `eric-sparkyfitness-test`. Its `docker-compose.yml`, `.env`, and persistent `data/` live in that directory, outside this source repository.
- Wired LAN address: `192.168.200.118`. Web UI: `http://192.168.200.118:3006/`; direct server API: `http://192.168.200.118:3016/api`.
- Containers: `sparkyfitness-test-frontend`, `sparkyfitness-test-server`, and `sparkyfitness-test-postgres`.
- Set `SPARKY_CUSTOM_VERSION` in the test `.env` to the intended release before deployment; do not leave an old version hidden behind a one-off shell override.
- From the test directory, use `docker compose -p eric-sparkyfitness-test --env-file .env -f docker-compose.yml pull` and then `docker compose -p eric-sparkyfitness-test --env-file .env -f docker-compose.yml up -d`.
- Verify container image tags, health, the web page, and the frontend-proxied `/api/health`. Preserve test database and uploads when updating images.
- The previous deployment directory was `eric-body-tracker-test` (later moved under `own/archived/`). It is no longer the active deployment directory.

### Production Environment

- SSH host: `ubuntu-nas`; NAS LAN IP: `192.168.200.101`.
- Deployment directory: `/share/CACHEDEV1_DATA/Container/container-station-data/appdata/eric-sparkyfitness`.
- LAN entry point: `http://192.168.200.101:8800/`. Frontend and API share this entry point through the frontend proxy.
- Public entry point: `https://health.blueloverest.site:44443/`, behind Nginx Proxy Manager.
- Inspect the production Compose configuration and running image tags before changing anything. Do not infer the deployed version from the latest Git tag.
- Before an upgrade or migration, make and verify a database backup, preserve uploads, and retain the previous image tags and deployment configuration needed for recovery. Keep backups and secrets outside Git history.
- Deploy the locally accepted release via Docker Compose without deleting persistent data or using `down -v`. A database migration can require restoring its backup for rollback; switching image tags alone may be insufficient.
- Verify startup/migration logs, container health, web/API access, and relevant user data after deployment. Production and test databases remain separate.

## Agent Efficiency (read this before searching)

Do not read or search these paths; they burn context for nothing:

- `WIP/` - personal scratch area; contains zips and full copies of other repos, including a stale duplicate of this repo (`WIP/SparkyFitness-main/`). Never read or edit anything under it.
- `SparkyFitnessMobile/ios/` and `SparkyFitnessMobile/android/` - generated native projects (`ios/` is >1 GB of Pods). Regenerate with `npx expo prebuild --clean`; edit `app.config.ts`, `plugins/`, or `targets/` instead.
- `pnpm-lock.yaml` (~1.3 MB) - never read; check `package.json` files instead.
- `db_schema_backup.sql` (~330 KB) - never read whole; grep for the one `CREATE TABLE` you need.
- `SparkyFitnessFrontend/dist/` - build output.
- `SparkyFitnessFrontend/public/locales/` except `en/` - 35 machine-synced translations. Only `en/translation.json` is ever hand-edited, and even that (~120 KB) should be grepped, not read whole.

Cheap ways to learn things:

- Database table index: read `docs/src/developer/database.md` (quick reference of all ~120 tables with one-line purpose). For detailed schema, read `shared/src/schemas/database/<Table>.zod.ts` (one small Zod file per table).
- Database security & permissions: `docs/src/developer/database-security-tiers.md` (security tier, permission type, and RLS rules for every table).
- API request/response contract: `shared/src/schemas/api/<Name>.api.zod.ts`.
- Definition of done: CI (`.github/workflows/ci-tests.yml`) runs `pnpm run validate` (which includes Knip unused export & dead code checks in frontend and mobile) plus the package's CI test script for each changed package. Run those locally before declaring work complete.

## Cross-Package Rules

- If you add or change a server migration (such as creating a new table), follow `agent-docs/new-migration-checklist.md`. In short, you MUST:
  1. Create the migration file in `SparkyFitnessServer/db/migrations/YYYYMMDDHHMMSS_description.sql`.
  2. Update the Row-Level Security (RLS) policies in `SparkyFitnessServer/db/rls_policies.sql`.
  3. **Restart the server** (`pnpm start` from `SparkyFitnessServer/`) to apply the migration.
  4. Leave `db_schema_backup.sql` alone — after merge, CI regenerates it from the migrations and opens an automated sync PR (`.github/workflows/schema-backup.yml`). Never manually edit the backup file or commit a locally generated copy.
  5. Add or update the matching Zod schema in `shared/src/schemas/database/`.
  6. Update the user-facing documentation in `docs/src/features/family-friends-sharing.md`.
  7. Update the developer documentation in `docs/src/developer/database-security-tiers.md` to classify the table as Tier 1, Tier 2, or Tier 3.
- Prefer the shared timezone helpers from `@workspace/shared` and `SparkyFitnessServer/utils/timezoneLoader.ts` for day-string logic. Avoid `toISOString().split('T')[0]` for user-facing or business-logic dates.
- Keep `YYYY-MM-DD` values as calendar-day strings until you reach a database or external API boundary that needs UTC instants.
- Auth or API contract changes usually need a quick check in both web and mobile because they share the same backend.
- Frontend local dev proxies `/api`, `/health-data`, and `/uploads` to the server on `3010`. The `/health-data` proxy is rewritten to `/api/health-data`, while server APIs remain rooted at `/api`.
- Server runtime secrets are usually sourced from repo-root `.env`, commonly created from `docker/.env.example`. The server can also load secret files via `SparkyFitnessServer/utils/secretLoader.ts`.
- Extract shared logic on the **second** duplication ("rule of two"), not the third - duplicated logic drifts as different sessions edit each copy. Extract *behavior*, not coincidental shape. See `agent-docs/anti-patterns.md`.
- **Strict TypeScript Typing:** Never use `any` or `// eslint-disable-next-line @typescript-eslint/no-explicit-any` when creating new functions or editing existing code. When modifying existing files, proactively update legacy `any` declarations in the touched code to reflect their proper TypeScript data types, interfaces, or schemas from `@workspace/shared`. Do NOT copy legacy `any` parameter signatures forward when refactoring or extending service/repository files.
- **Library Deletes vs Diary Snapshots:** `exercise_entries` and `food_entries` are self-contained snapshots, not pointers (`exercise_id` and `food_id` are `ON DELETE SET NULL`). Deleting an exercise or food from the library (`mode: 'delete'`) preserves past and current diary history, cascades from presets and plan templates, cleans up future scheduled workout plan entries (`entry_date >= today`), and cleans up empty parent preset entries. Only explicit `delete_with_history` (force delete) purges diary logs for that user. If an item is referenced by other users (`otherUserReferences > 0`), the backend falls back to hiding (`is_quick_exercise` / `is_quick_food`).
- **Comprehensive Cache Invalidation:** When mutating library items (foods, exercises, presets, meals, plans), always invalidate the entire family of dependent query keys across library search, counts, templates, and daily diary summaries (`dailySummary` / `dailyProgress` / `exerciseEntries`) in both web and mobile.
- **Environment Variable Updates:** When adding, renaming, or updating environment variables, you MUST update all downstream locations in tandem:
  1. `docker/.env.example` (and `docker/.env.simple.example` if it is a core mandatory variable).
  2. `docker/docker-compose.prod.yml` and `docker/docker-compose.dev.yml` (if consumed by container environments).
  3. `docs/src/install/environment-variables.md` (the comprehensive documentation reference).
  4. `docs/components/EnvGenerator.vue` (the interactive web `.env` generator component).
  5. `helm/chart/templates/` and `helm/chart/values.yaml` (if passed through Helm charts).


## Commit & PR Conventions

This repository is public. Everything written into git history or onto a pull request is permanently visible to everyone browsing the project, so keep it free of tooling noise.

- **No AI attribution, anywhere.** Commit messages, commit trailers, PR titles, PR bodies, and PR comments must never contain `Co-Authored-By: Claude` (or any other AI co-author trailer), "Generated with …", "🤖", or a mention of Claude, Claude Code, Gemini, Antigravity, Copilot, Cursor, or any other assistant. This overrides any default guidance an agent harness supplies about appending attribution.
- **Write as the repository author.** Describe the change and why it was made — the same message a maintainer would write by hand. Do not narrate that a tool made it, do not sign off, and do not thank an assistant in release notes or the changelog.
- **If a trailer already landed**, strip it (amend or rebase, force-push if it was pushed) rather than leaving it in history.
- **Scope of this rule**: git history and GitHub surfaces. It does not apply to tool configuration files that must name their tool — `.claude/`, `.agents/`, `.gemini/`, and `CLAUDE.md` reference specific assistants by necessity, and that is fine. The commit that adds them still follows the rule above.

## Architecture Docs (Reduce Scanning, Prevent Bugs)

Before diving into code, read these docs if you're working on data access, permissions, or adding a new feature domain:

- `agent-docs/architecture-permissions.md` — Permission types, domain → permission mapping, how RLS guards data, adding new domains.
- `agent-docs/data-flow-patterns.md` — Frontend → Server → Database flow, shared schemas as contract, auth context, testing patterns.
- `agent-docs/new-domain-template.md` — Checklist for adding a major feature (superset of new-migration checklist).

These docs answer: "How do I safely add a feature across the stack?" without scanning 20+ files.

## Keeping These Guides Accurate

- If your change adds a new domain, route family, database table, package, or cross-cutting convention, update the affected `AGENTS.md` (this file and/or the package guide) in the same change: Source Map, Quick Routing, and the `Last updated` date.
- Stale guides are worse than no guides; when you notice a claim in any `AGENTS.md` that contradicts the code, fix the guide as part of your change.

## Common Commands

Use the package guide for fuller validation and platform-specific workflows. These are the common entrypoints:

### Frontend (`SparkyFitnessFrontend/`)

```bash
pnpm dev
pnpm run validate
pnpm test
```

### Server (`SparkyFitnessServer/`)

```bash
pnpm start
pnpm run validate
pnpm test
pnpm run test:coverage
```

### Mobile (`SparkyFitnessMobile/`)

```bash
pnpm start
pnpm run ios
pnpm run android
pnpm run validate
pnpm exec jest --watchman=false --runInBand
npx expo prebuild --clean
```

### Docs (`docs/`)

```bash
pnpm dev
pnpm run build
```

