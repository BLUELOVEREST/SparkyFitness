# Android Hydration Widget Design

Date: 2026-08-12
Status: Draft approved for implementation planning

## Goal

Add an Android home-screen hydration widget for SparkyFitness that can record today's water intake without opening the app.

The widget should support multiple sizes so it remains useful as a compact quick action and as a fuller hydration dashboard.

## User Decisions

- The widget must perform real one-tap logging in the background.
- Quick add amounts are `250ml`, `350ml`, and `500ml`.
- Small and medium layouts must include a reduce action so accidental taps can be corrected.
- The reduce action is `-250ml` for the first version.
- Tapping the non-button body opens the SparkyFitness Dashboard.

## Layouts

### Small

Target size: approximately `2x1`.

Content:

- Today's consumed water.
- Compact progress indicator.
- `-250ml` action.
- `+250ml` action.

This layout is optimized for fast correction and fast logging.

### Medium

Target size: approximately `3x2`.

Content:

- Today's consumed water.
- Daily goal and progress.
- `+250ml`, `+350ml`, and `+500ml` actions.
- `-250ml` action.

This is the default practical layout because it exposes all common add amounts without requiring the full large widget.

### Large

Target size: approximately `4x2` or larger.

Content:

- Today's consumed water.
- Daily goal.
- Progress percentage.
- Last updated or sync status.
- `+250ml`, `+350ml`, and `+500ml` actions.
- `-250ml` action.
- Body tap target to open Dashboard.

The large layout prioritizes status clarity and failure visibility.

## Architecture

Reuse the existing Android widget foundation:

- `SparkyFitnessMobile/plugins/withGlanceAndroidSupport.ts`
- `SparkyFitnessMobile/plugins/withCalorieWidget.ts`
- `SparkyFitnessMobile/targets/android-widget`
- `SparkyFitnessMobile/src/hooks/useWidgetSync.ts`
- `SparkyFitnessMobile/src/services/CalorieWidgetBridge.ts`

Add a hydration widget implemented with Android Glance. The Expo config plugin should copy the Kotlin and resource files into the generated Android project during prebuild and register the widget receiver in the Android manifest.

The hydration widget can be implemented as one resizable widget whose Glance layout changes based on size. If Glance size handling proves too limiting in the current project setup, the fallback is to register separate small/medium/large hydration widget providers.

## Data Flow

When the app is opened on Dashboard and today's summary is available:

1. The React Native layer prepares a hydration snapshot.
2. The snapshot includes date, consumed ml, goal ml, progress, last updated time, and the configured endpoint/auth material needed for widget actions.
3. The Android native bridge persists the snapshot for the widget.
4. The widget renders from the persisted snapshot.

When the user taps a widget action:

1. Android receives the action in a widget receiver.
2. The receiver reads the persisted server configuration and auth data.
3. The receiver calls the existing backend endpoint:
   `POST /api/measurements/water-intake`
4. The request payload changes today's intake by the selected amount.
5. On success, the widget updates its persisted hydration snapshot and refreshes.
6. On failure, the widget keeps the previous value and records failure state for display.

## API And Auth

The widget should use the same server endpoint as the app's hydration card. It must not introduce an unauthenticated backend shortcut.

Authentication handling:

- API-key based mobile configuration is the most reliable mode for background widget writes.
- Session-token based configuration can work while the token remains valid, but if the session expires the widget cannot complete interactive reauth.
- On auth failure, the widget should show a stale/failure state and tapping the body should open the app.

Sensitive values must not be logged. Persisted auth data should use Android private app storage, with encrypted storage preferred if practical in this native context.

## Error Handling

Expected states:

- No server configured: show setup/open-app state.
- No usable auth: show open-app state.
- Network failure: retain last known hydration value and show sync failed/stale indicator.
- Server rejection: retain last known value and show sync failed/stale indicator.
- Decrement below zero: clamp server-side or client-side to avoid negative intake.

The widget should not show blocking dialogs or notifications for normal failures.

## Testing

Validation should cover:

- TypeScript typecheck for the mobile package.
- Existing mobile lint.
- Unit coverage for hydration snapshot serialization where practical.
- Native prebuild check to verify receiver/resource registration.
- Manual Android test:
  - Add small, medium, and large widget sizes.
  - Tap `+250ml`, `+350ml`, `+500ml`, and `-250ml`.
  - Confirm the app Dashboard and server data update.
  - Confirm widget refreshes after app opens and after background actions.
  - Confirm failed network/auth state does not corrupt displayed totals.

## Out Of Scope

- iOS hydration widget changes.
- Multiple custom decrement amounts.
- User-configurable widget button presets.
- Health Connect writeback changes beyond existing app behavior.
- New backend unauthenticated or widget-only endpoints.
