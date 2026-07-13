# Training Focus Plan Carb Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light-weight Workout Plan mode for training focus planning and let Carb Cycle Meal Plans use it to choose pre/post-workout meal labels and macro distribution.

**Architecture:** Keep the original detailed workout plan path intact. Add a `training_focus` plan mode on workout plan templates with a dedicated session table for four daily time slots and one primary training session per training day. Carb Cycle generation reads an active training-focus workout plan instead of manually duplicating training slot state inside Meal Plan.

**Tech Stack:** Node/Express, PostgreSQL migrations, React, TypeScript, Vitest.

---

### Task 1: Backend Training Focus Persistence

**Files:**
- Create: `SparkyFitnessServer/db/migrations/20260713010000_add_training_focus_workout_plans.sql`
- Modify: `SparkyFitnessServer/models/workoutPlanTemplateRepository.ts`
- Modify: `SparkyFitnessServer/services/workoutPlanTemplateService.ts`
- Test: `SparkyFitnessServer/tests/workoutPlanTemplate.trainingFocus.test.ts`

- [ ] Add a migration that adds `plan_mode` to `workout_plan_templates` with default `detailed`, and creates `workout_plan_focus_sessions`.
- [ ] Add repository methods to create, replace, and fetch focus sessions for a workout plan template.
- [ ] Add service validation: each day has four slots; `rest` cannot be primary; a training day must have exactly one primary; a rest day must have none.
- [ ] Add backend tests for valid multi-session day, invalid two-primary day, and invalid training day with no primary.
- [ ] Run `COREPACK_HOME=/tmp/corepack-cache corepack pnpm --filter sparkyfitnessserver test -- workoutPlanTemplate.trainingFocus.test.ts`.

### Task 2: Frontend Workout Plan UI

**Files:**
- Modify: `SparkyFitnessFrontend/src/types/workout.ts`
- Modify: `SparkyFitnessFrontend/src/pages/Exercises/AddWorkoutPlanDialog.tsx`
- Modify: `SparkyFitnessFrontend/src/pages/Exercises/WorkoutPlansManager.tsx`
- Test: `SparkyFitnessFrontend/src/tests/components/AddWorkoutPlanDialog.trainingFocus.test.tsx`

- [ ] Add `plan_mode` and `focus_sessions` types.
- [ ] Add `Plan Type` choice in Add/Edit Workout Plan: `Detailed Plan` or `Training Focus Plan`.
- [ ] In `Training Focus Plan`, show a seven-day by four-slot editor with focus select and primary radio.
- [ ] Hide workout preset assignment UI while `Training Focus Plan` is selected.
- [ ] Add tests proving a day can have two training slots and only one primary.
- [ ] Run `COREPACK_HOME=/tmp/corepack-cache corepack pnpm --filter sparkyfitnessfrontend test -- AddWorkoutPlanDialog.trainingFocus.test.tsx`.

### Task 3: Carb Cycle Uses Training Focus Plan

**Files:**
- Modify: `SparkyFitnessServer/services/carbCyclePlannerService.ts`
- Modify: `SparkyFitnessServer/services/weeklyGoalPlanService.ts`
- Modify: `SparkyFitnessServer/routes/weeklyGoalPlanRoutes.ts`
- Modify: `SparkyFitnessFrontend/src/pages/Foods/MealPlanTemplateForm.tsx`
- Modify: `SparkyFitnessFrontend/src/types/goals.ts`
- Test: `SparkyFitnessServer/tests/carbCyclePlannerService.test.ts`
- Test: `SparkyFitnessFrontend/src/tests/components/MealPlanTemplateForm.carbCycle.test.tsx`

- [ ] Extend Carb Cycle input to accept `trainingSessionsByDay`.
- [ ] Keep legacy `trainingSlots` as fallback for existing tests and old clients.
- [ ] Compute meal labels and macro distribution from each day’s primary focus session.
- [ ] In the Meal Plan form, replace manual `Primary Training Slot` with selecting an active `Training Focus Plan`.
- [ ] Show a compact read-only preview of the selected focus plan inside Carb Cycle generation.
- [ ] Run server and frontend carb cycle tests.

### Task 4: Integration Verification

**Files:**
- Existing files only.

- [ ] Run `COREPACK_HOME=/tmp/corepack-cache corepack pnpm --filter sparkyfitnessserver test -- carbCyclePlannerService.test.ts workoutPlanTemplate.trainingFocus.test.ts`.
- [ ] Run `COREPACK_HOME=/tmp/corepack-cache corepack pnpm --filter sparkyfitnessfrontend typecheck`.
- [ ] Run `COREPACK_HOME=/tmp/corepack-cache corepack pnpm --filter sparkyfitnessfrontend test -- MealPlanTemplateForm.carbCycle.test.tsx AddWorkoutPlanDialog.trainingFocus.test.tsx`.
- [ ] Commit implementation.
- [ ] Tag as `v0.17.3-eric.6` and push to trigger the custom image build.
