# Food Flow Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the food-flow decisions from `2026-07-14-food-flow-optimization-notes.md` for the Eric custom SparkyFitness flow.

**Architecture:** Keep all changes inside SparkyFitness' native food/provider/planning architecture. Add Chinese provider adapters through the existing external provider system, add persistent food macro roles for carb-cycle planning, and keep original average-mode behavior unchanged.

**Tech Stack:** TypeScript, Express, PostgreSQL migrations, React, TanStack Query, Jest, Vitest.

---

## File Structure

- `SparkyFitnessServer/db/migrations/*_add_eric_food_flow_features.sql`: add provider types, food macro role fields, and default Chinese provider seed.
- `SparkyFitnessServer/integrations/chinafood/chinaFoodCompositionService.ts`: search bundled Chinese Food Composition JSON.
- `SparkyFitnessServer/integrations/boohee/booheeService.ts`: search Boohee Open API with bearer token.
- `SparkyFitnessServer/integrations/grocy/grocyFoodService.ts`: self-hosted provider shell returning no results until Grocy nutrition schema is finalized.
- `SparkyFitnessServer/services/externalFoodSearchService.ts`: add provider dispatch, credential rules, and limited-provider metadata.
- `SparkyFitnessFrontend/src/components/FoodSearch/FoodSearch.tsx`: add provider handlers and limited-provider fallback behavior for All Providers.
- `SparkyFitnessFrontend/src/hooks/Foods/useAllProvidersFoodSearch.ts`: search non-limited providers first, Boohee only if no results.
- `SparkyFitnessFrontend/src/pages/Foods/MealPlanTemplateForm.tsx`: role-specific carb-cycle food selection and amount recommendation.
- `SparkyFitnessFrontend/src/utils/carbCycleFoodRoles.ts`: macro-role inference and priority-based amount calculation.
- `SparkyFitnessFrontend/src/hooks/Foods/useFoodDatabaseManager.ts`: stop Food Database import from opening the diary quantity selector.

## Tasks

### Task 1: Fix Food Database import continuation and picker duplicates

- [ ] Write/adjust frontend tests showing Food Database provider import stops after saving and empty food picker deduplicates recent/top foods.
- [ ] Modify `useFoodDatabaseManager.ts` so the Food Database import path does not open `FoodUnitSelector`.
- [ ] Modify `FoodSearch.tsx` empty state to dedupe by `food.id` while preserving recent-before-top ordering.
- [ ] Run targeted frontend tests.

### Task 2: Add Chinese food provider types and backend adapters

- [ ] Write Vitest coverage for `china-food-composition`, `boohee`, and missing/inactive credentials.
- [ ] Add migration rows for `china-food-composition`, `grocy`, and `boohee`.
- [ ] Add bundled local JSON search adapter and normalized Sparky food mapping.
- [ ] Add Boohee adapter using `Authorization: Bearer <app_key>`.
- [ ] Add Grocy adapter placeholder that is active only when configured and safely returns empty results.
- [ ] Add provider dispatch to `externalFoodSearchService.ts` and v2 food details where needed.
- [ ] Run targeted backend tests.

### Task 3: Add frontend provider support and All Providers fallback

- [ ] Write tests for All Providers search: non-limited providers first, Boohee fallback only when all return empty, direct Boohee search still works.
- [ ] Update provider settings field rules so Grocy asks for Base URL/API Key and Boohee asks for API Key only.
- [ ] Add single-provider handlers for Chinese Food Composition, Grocy, and Boohee.
- [ ] Update All Providers hook to partition limited providers and call Boohee only as fallback.
- [ ] Run targeted frontend tests.

### Task 4: Add strict macro roles to foods

- [ ] Write tests for macro-role inference and food form persistence.
- [ ] Add DB field `foods.macro_role` constrained to `carb`, `protein`, `fat`, or null.
- [ ] Add backend create/update/read support for `macro_role`.
- [ ] Add frontend food type support and food form selector.
- [ ] Ensure provider imports suggest a role without changing nutrition values.
- [ ] Run targeted backend/frontend tests.

### Task 5: Update carb-cycle Meal Plan selection

- [ ] Write unit tests for low/medium/high priority amount recommendation.
- [ ] Add `carbCycleFoodRoles.ts` helper with:
  - low: protein -> fat -> carb
  - medium/high: protein -> carb -> fat
  - all selected foods contribute all nutrients to actual totals.
- [ ] Change carb-cycle meal cards to show one slot for carb, protein, and fat.
- [ ] Filter food picker by selected macro role in carb-cycle mode.
- [ ] Store each selected food as normal meal-plan assignments, preserving Sparky's existing model.
- [ ] Show target/actual/delta and allow manual quantity edits.
- [ ] Run targeted frontend tests.

### Task 6: Validation

- [ ] Run backend targeted tests.
- [ ] Run frontend targeted tests.
- [ ] Run typecheck for touched packages if targeted tests pass.
- [ ] Inspect git diff for unrelated changes before final response.

