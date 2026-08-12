# Android Hydration Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Android home-screen hydration widget that can record today's water intake in the background with `+250ml`, `+350ml`, `+500ml`, and `-250ml` actions.

**Architecture:** Extend the existing Android Glance widget system rather than introducing a new widget framework. React Native will sync a hydration snapshot and action configuration into the native bridge; Android Glance receivers will render the widget and perform background API writes using the persisted active server config.

**Tech Stack:** Expo SDK 56 config plugins, React Native TypeScript, Android Glance, Kotlin, Jest, `pnpm` mobile validation.

---

### Task 1: Hydration Snapshot Model

**Files:**
- Create: `SparkyFitnessMobile/src/utils/widgetSnapshots.ts`
- Test: `SparkyFitnessMobile/__tests__/utils/widgetSnapshots.test.ts`

- [ ] **Step 1: Write failing tests for hydration snapshot math**

Create tests that verify progress clamping, ml/liter display formatting, stale failure state, and action amounts.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `cd SparkyFitnessMobile && pnpm exec jest --watchman=false --runInBand __tests__/utils/widgetSnapshots.test.ts`

- [ ] **Step 3: Implement `buildHydrationWidgetSnapshot`**

The helper should accept date, consumed ml, goal ml, auth/action metadata, and optional status. It should return a serializable object containing consumed ml, goal ml, progress `0..1`, display strings, fixed actions `[250, 350, 500]`, decrement `250`, and `lastUpdated`.

- [ ] **Step 4: Re-run the focused test**

Expected: all widget snapshot tests pass.

### Task 2: Android Bridge Contract

**Files:**
- Modify: `SparkyFitnessMobile/src/services/CalorieWidgetBridge.ts`
- Modify: `SparkyFitnessMobile/src/hooks/useWidgetSync.ts`
- Test: `SparkyFitnessMobile/__tests__/hooks/useWidgetSync.test.tsx` or `SparkyFitnessMobile/__tests__/utils/widgetSnapshots.test.ts`

- [ ] **Step 1: Write failing tests or extend snapshot tests for hydration bridge payload shape**

Verify the payload includes date, consumed ml, goal ml, action amounts, decrement amount, and action endpoint/auth fields.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run the same focused Jest command used by the new test file.

- [ ] **Step 3: Add TypeScript bridge methods**

Extend the native module interface with `setHydrationSnapshot(json: string): Promise<void>` and `reloadHydrationWidget(): Promise<void>`.

- [ ] **Step 4: Sync hydration from `useWidgetSync` on Android**

Use the daily summary's `waterConsumed` and `waterGoal` to build and push the hydration snapshot whenever today's summary changes.

- [ ] **Step 5: Re-run focused tests**

Expected: focused tests pass.

### Task 3: Android Native Hydration Widget

**Files:**
- Modify: `SparkyFitnessMobile/plugins/withCalorieWidget.ts`
- Create: `SparkyFitnessMobile/targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/HydrationWidget.kt.tmpl`
- Create: `SparkyFitnessMobile/targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/HydrationWidgetReceiver.kt.tmpl`
- Modify: `SparkyFitnessMobile/targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/CalorieWidgetModule.kt.tmpl`
- Create: `SparkyFitnessMobile/targets/android-widget/res/xml/sparky_hydration_widget_info.xml`
- Modify: `SparkyFitnessMobile/targets/android-widget/res/values/widget_strings.xml`

- [ ] **Step 1: Add the widget receiver registration test by inspection**

Use `rg -n "HydrationWidgetReceiver|sparky_hydration_widget_info" SparkyFitnessMobile/plugins SparkyFitnessMobile/targets/android-widget` before implementation and confirm no matches.

- [ ] **Step 2: Implement the native widget and receiver**

Add Glance Kotlin templates for rendering small/medium/large size variants and action callbacks.

- [ ] **Step 3: Extend the native module**

Persist hydration snapshots, reload the widget, and expose methods used by React Native.

- [ ] **Step 4: Register receiver and resource XML in the config plugin**

Add `HydrationWidgetReceiver` to the receiver list in `withCalorieWidget.ts`.

- [ ] **Step 5: Verify by search**

Run: `rg -n "HydrationWidgetReceiver|sparky_hydration_widget_info|setHydrationSnapshot|reloadHydrationWidget" SparkyFitnessMobile/plugins SparkyFitnessMobile/targets/android-widget SparkyFitnessMobile/src`

### Task 4: Native Prebuild And Validation

**Files:**
- Generated verification only; do not commit generated `android/` changes unless the project convention requires it.

- [ ] **Step 1: Run TypeScript/Jest focused verification**

Run: `cd SparkyFitnessMobile && pnpm exec jest --watchman=false --runInBand __tests__/utils/widgetSnapshots.test.ts`

- [ ] **Step 2: Run mobile typecheck**

Run: `cd SparkyFitnessMobile && pnpm run typecheck`

- [ ] **Step 3: Run mobile lint**

Run: `cd SparkyFitnessMobile && pnpm run lint`

- [ ] **Step 4: Run prebuild verification if dependencies are available**

Run: `cd SparkyFitnessMobile && npx expo prebuild --platform android --clean`

- [ ] **Step 5: Inspect generated Android output**

Verify generated Android files contain the hydration receiver, widget XML, and native module methods.

### Task 5: Commit Implementation

**Files:**
- Commit only source-controlled mobile files and tests.

- [ ] **Step 1: Review git status**

Run: `git status --short`

- [ ] **Step 2: Stage hydration widget files only**

Stage the TypeScript, Kotlin template, XML, and test files for this feature. Do not stage `.superpowers/`, unrelated APK artifacts, ESPHome files, or generated native projects.

- [ ] **Step 3: Commit**

Run: `git commit -m "feat: add android hydration widget"`
