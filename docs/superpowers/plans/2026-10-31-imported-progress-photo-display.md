# Imported Progress Photo Display (Task C)

Implementation date: 2026-10-31. This document records the photo implementation and focused checks. Complete local integration and browser results are in `2026-10-31-sparkygym-acceptance-optimizations.md`; unit tests alone do not establish native-device acceptance.

## Behavior

- Web: Check-in's Progress Photos panel includes a separate dated, read-only openGym gallery, independent of the collapsible native angle slots. Click a thumbnail to open its full-size authenticated image.
- Mobile: Progress Photos includes the same dated gallery and a full-screen viewer. Imported photos use authenticated/proxy image headers and `cachePolicy="none"`, not persistent disk caching.
- Imports intentionally do not participate in angle-based comparisons or time-lapses: openGym day photos have no front/back/side angle. No fabricated angles, weight/check-in rows or workout rows.
- Existing archived imports appear on the first list request, without reupload or reprojection. Neither gallery periodically polls business data. Web uses mount/focus refresh and the existing `useSparkyGymNotifications` invalidation path (including snapshot recovery); no new SSE protocol or stream is added. Mobile retains mount/focus/manual refresh. Progress Photos pull-to-refresh invalidates imported and native photos, including on an empty native-history day. A removed photo is no longer viewable when the refreshed list omits it; failed list refreshes hide stale photos. Backend live-reference guards remain authoritative.
- No migration, uploads/static mount, environment variable or settings changes.

## API And Security

`GET /api/integrations/sparkygym/progress-photos` returns `[{id, entry_date, source: "opengym"}]`, newest date first and then media ID. No filesystem paths, peer origins, credentials or source payloads are returned.

- Global authentication and the existing owner router's authenticated-actor guard apply. `requireSelfActor` additionally rejects a switched/delegated context before the photo query.
- Reads use `withOwnerTransaction` with `(owner, owner)` RLS context and the existing owner advisory lock, never the system pool.
- Selection joins `sparkygym_entities.local_id` to `sparkygym_media.id` for the same user. Requires `personal_media`, not tombstoned, `kind=progress`, null workout reference, ready media, a non-null private path and image MIME. Video is excluded. Invalid calendar dates are dropped. Duplicate media/date pairs are collapsed; separate dates remain distinct.
- Bytes continue through `/api/integrations/sparkygym/media/:id`, with owner-only `requireSelfActor`, private/no-store headers, nosniff and existing archive-root containment. The byte query also requires a surviving non-tombstoned personal-media entity, so orphaned ready files cannot be retrieved by stale URLs. This route still supports live workout images.
- Native check-in photo list/date/gallery/file APIs remain unchanged; delegates do not receive imported metadata through their check-in permissions.
- Web queries are scoped by active user, disabled while delegated, and cached imports are hidden in delegated context. Mobile metadata keys include server configuration ID, server URL and owner profile ID; requests and cached display are disabled until both identities are available. Existing identity-change cache clearing remains intact. Mobile uses authenticated image headers and server-side self checks.
- Supported image decoding remains platform-dependent (for example HEIC/HEIF). No conversion, video player or public derivative is introduced.

## Files

Paths below are relative to the source repository root.

- `shared/src/schemas/api/CheckInPhotos.api.zod.ts`: imported metadata schema/type.
- `SparkyFitnessServer/models/importedProgressPhotoRepository.ts`: read-only existing archive selection.
- `SparkyFitnessServer/integrations/opengym/routes.ts`: photo metadata GET, media self guard and live-reference check only; no management service edits.
- `SparkyFitnessServer/tests/importedProgressPhotoRepository.test.ts`: no-port selection/context/date tests.
- `SparkyFitnessServer/tests/importedProgressPhotoRoutes.test.ts`: HTTP boundary tests.
- `SparkyFitnessFrontend/src/api/CheckIn/importedProgressPhotoService.ts`.
- `SparkyFitnessFrontend/src/hooks/CheckIn/useImportedProgressPhotos.ts`: owns the query, active-owner/delegate gating and authenticated image URL access. The page imports this hook, not the API service or TanStack Query.
- `SparkyFitnessFrontend/src/tests/hooks/useImportedProgressPhotos.test.tsx`: real `renderHook`/QueryClient tests for owner-scoped caching, disabled-context hiding, no polling and notification-root invalidation.
- `SparkyFitnessFrontend/src/pages/CheckIn/ImportedProgressPhotos.tsx`.
- `SparkyFitnessFrontend/src/pages/CheckIn/CheckInPhotos.tsx`: mounts the imported gallery only.
- `SparkyFitnessFrontend/src/tests/api/importedProgressPhotoService.test.ts`.
- `SparkyFitnessFrontend/src/tests/pages/CheckIn/ImportedProgressPhotos.test.tsx`.
- `SparkyFitnessFrontend/src/tests/pages/CheckIn/CheckInPhotos.test.tsx`: isolates the new separately tested child.
- `SparkyFitnessFrontend/src/hooks/Integrations/useSparkyGymNotifications.ts`: adds the imported-photo root to existing event-driven invalidation only.
- `SparkyFitnessFrontend/src/tests/hooks/useSparkyGymNotifications.test.tsx`: committed-event and snapshot-recovery invalidation coverage.
- `SparkyFitnessMobile/src/services/api/importedProgressPhotosApi.ts`.
- `SparkyFitnessMobile/src/components/ImportedProgressPhotos.tsx`.
- `SparkyFitnessMobile/src/screens/ProgressPhotosScreen.tsx`: mounts the imported gallery and supports native/imported pull-to-refresh in populated and empty/error native-history states.
- `SparkyFitnessMobile/__tests__/services/api/importedProgressPhotosApi.test.ts`.
- `SparkyFitnessMobile/__tests__/components/ImportedProgressPhotos.test.tsx`.
- `SparkyFitnessMobile/__tests__/screens/ProgressPhotosScreen.test.tsx`: isolates the new separately tested child.
- This handoff document.

## Exact English Locale Additions

Add this root-level object to both web and mobile English locale JSON. No locale file was edited by task C. `common.close` already exists.

```json
{
  "importedProgressPhotos": {
    "title": "openGym photos (read-only)",
    "loading": "Loading imported photos...",
    "loadError": "Could not load imported photos.",
    "retry": "Retry",
    "openPhoto": "View openGym photo from {{date}}",
    "photo": "openGym progress photo"
  }
}
```

## Validation And Remaining Acceptance

Final focused no-port results:

- Server: 13 tests passed across `importedProgressPhotoRepository.test.ts` and `sparkyGymRepository.test.ts`.
- Web: 48 tests passed across imported API/gallery, native photo panel/gallery hook, progress-photo utilities, comparison and time-lapse tests.
- Mobile: 43 tests passed across imported API/gallery, progress-photo screen, native photo hooks/source/API tests.
- The original 18 task-C files passed explicit-file Prettier checking. Repository `git diff --check` passed. The review follow-up additionally covers the existing web notification hook and its tests.
- These initial focused checks did not cover full package validation or visual acceptance. Subsequent integrated checks are recorded in the implementation closeout.

Review follow-up verification (no business polling): web notification/gallery suites passed 9 tests; mobile gallery/screen/imported-API suites passed 30 tests. Regressions cover absence of `refetchInterval`, event and snapshot invalidation, server/owner query-key changes, unavailable-identity hiding and populated/empty-history pull refresh. All 10 review-touched files passed explicit-file Prettier checks; `git diff --check` passed. Backend routes/guards and the six locale keys are unchanged by this follow-up.

Frontend layering follow-up: query and URL access now live in `hooks/CheckIn/useImportedProgressPhotos.ts`, preserving the `['imported-progress-photos', activeUserId]` key and existing notification root. Component tests mock the custom hook; query behavior is exercised with `renderHook` and real QueryClient providers, not direct `useQuery` imports in tests. Five focused frontend suites passed 15 tests, and scoped ESLint passed with zero warnings across the hook, gallery, notification hook and their tests. No ESLint suppression, backend/mobile edit, locale edit or deployment operation is part of this follow-up.

Port-binding HTTP tests initially encountered sandbox `listen EPERM`. They subsequently passed with the required local port permissions during integration (35 tests). The focused command is:

```sh
# From SparkyFitnessServer
pnpm exec vitest run tests/importedProgressPhotoRoutes.test.ts tests/sparkyGymRoutes.test.ts tests/checkInPhotoRoutes.test.ts
```

The repository unit suite inspects the selection SQL and validates response/date handling; it does not replace real PostgreSQL/RLS acceptance. The integrated closeout records package validation and isolated database tests separately. Known upstream mobile translation-audit duplicate keys remain outside this task.

Local web browser checks verified the existing October 31 archived synthetic photo and private viewer, without changing native measurement/workout counts. Access regressions cover anonymous and delegated contexts, tombstoned/detached filtering and live workout images. Mobile source and tests include the gallery and event invalidation; native APK installation remains a separate acceptance step. No image/APK release or production deployment occurred during implementation.
