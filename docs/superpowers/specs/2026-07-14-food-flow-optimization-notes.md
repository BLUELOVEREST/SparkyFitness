# Food Flow Optimization Notes

## Background

This document tracks food-related UX and data-flow issues for the Eric custom
SparkyFitness flow. The goal is to discuss the problems together first, then
batch the implementation after the expected behavior is clear.

Current focus:

- Provider search imports foods into the local Food Database.
- Food Database stores atomic foods and their variants.
- Meal Management stores reusable meals composed from foods and/or linked meals.
- Meal Plan can currently add either an atomic food or a meal.
- Chinese food providers should integrate into SparkyFitness' existing Food
  Exercise Data Providers system instead of using a separate custom lookup
  endpoint.

## Confirmed Current Behavior

### 1. Food Database "Add New Food" opens a second quantity dialog

Observed flow:

1. Go to Food Database.
2. Click `Add New Food`.
3. Search an online provider and save/import a food.
4. A second `FoodUnitSelector` dialog opens.
5. The dialog title/button implies `Add to Meal`.
6. Confirming the dialog actually creates a diary food entry for today, using
   breakfast as the meal type.

Code evidence:

- `Foods.tsx` opens `FoodSearchDialog` with `hideDatabaseTab={true}` and
  `hideMealTab={true}`.
- `useFoodDatabaseManager.handleFoodSelected()` receives the imported food and
  opens `FoodUnitSelector`.
- `useFoodDatabaseManager.handleAddFoodToMeal()` calls `createFoodEntry()` with
  `meal_type: 'breakfast'`.
- Comparing the current custom branch to `upstream/main` shows no custom diff in
  this flow, so this is upstream behavior, not introduced by the carb-cycle
  customization.

Problem:

- The user intent is "add this provider result to my local Food Database".
- The app unexpectedly continues into "log this food to today's diary".
- The wording says `Add to Meal`, but the actual action is a diary food entry,
  not adding to a Meal Management meal.

Preferred direction:

- In Food Database, provider import should end after saving the food to the
  local database.
- Do not open `FoodUnitSelector` after provider import from Food Database.
- If a quick-log workflow is still useful upstream, it should be a separate
  explicit action, not the default continuation of `Add New Food`.

### 2. MealBuilder can show the same food twice in the empty search state

Observed flow:

1. Open Meal Management.
2. Create or edit a meal.
3. Click `Add food or Meal`.
4. Before typing a search term, the same food can appear twice.

Likely root cause:

- `EnhancedFoodSearch` renders both `recentFoods` and `topFoods` when the search
  input is empty.
- The same food can be both recent and top.
- The UI currently renders both lists without deduplicating by `food.id`.

Problem:

- This makes the user think the food exists twice in the database.
- It is especially confusing after importing/logging a food from Food Database,
  because the newly used food becomes eligible for both lists.

Preferred direction:

- Deduplicate the empty-state local food list by `food.id`.
- Preserve the usefulness of recent/top ordering, but never render the same food
  twice in one picker.

### 3. MealBuilder mixes Food and Meal results in one picker

Observed flow:

1. Open MealBuilder.
2. Search in `Add food or Meal`.
3. Results may include both `Your Foods` and `Your Meals`.
4. If a food and a meal share the same name, they can look like duplicates.

Current data model:

- A Food is an atomic item from `foods` plus `food_variants`.
- A Meal is a reusable recipe/template from `meals`.
- A Meal references foods through `meal_foods`; it is not a second food record.

Problem:

- The model is valid, but the UI language makes it easy to confuse Food and
  Meal.
- In carb-cycle planning, atomic food selection is usually the clearer default,
  because macro targets are controlled per food amount.

Preferred direction:

- In MealBuilder, keep Food and Meal support if desired, but make the result
  type obvious.
- For the Eric carb-cycle flow, prefer food-first selection.
- Consider hiding Meal results in places where adding a nested Meal adds
  complexity without helping macro precision.

### 4. Chinese food providers should use provider-aware fallback search

Required provider types:

- `china-food-composition`: built-in local JSON provider backed by the bundled
  Chinese Food Composition data. It needs no credentials and should be available
  as a food provider by default.
- `grocy`: local/self-hosted provider. It requires `base_url` and `app_key`.
  When configured and active, it should participate in normal provider search.
- `boohee`: limited remote provider. It requires an API key and should only be
  called when the user explicitly selects Boohee or when it is needed as an All
  Providers fallback.

Expected All Providers behavior:

1. Search all active non-limited food providers first. This includes built-in
   providers such as Open Food Facts, Swiss Food Database, Chinese Food
   Composition, and configured local/self-hosted providers such as Grocy.
2. If any non-limited provider returns results, show those results and do not
   call Boohee.
3. If no non-limited provider returns results, and Boohee is configured and
   active, call Boohee once as the final fallback.
4. If Boohee is not configured or inactive, All Providers simply returns the
   non-limited provider results, which may be empty.

Expected single-provider behavior:

- If the user explicitly selects Boohee, search Boohee directly.
- If the user explicitly selects Grocy, search Grocy directly.
- If the user explicitly selects Chinese Food Composition, search the bundled
  local JSON directly.

Reasoning:

- Boohee has limited daily calls, so All Providers must not fan out to Boohee on
  every search when local/free providers already found usable results.
- Grocy is self-hosted/local in this flow, so it should be included in normal
  All Providers search whenever it is configured and active.
- The user-facing entry should still feel native to SparkyFitness: provider
  setup remains in `Food Exercise Data Providers`, and Food Search continues to
  use the existing provider selector.

### 5. Carb Cycle food selection should use strict macro roles

The Eric carb-cycle flow should not use complex/mixed foods at this stage. The
goal is simple, repeatable planning with foods that have a clear primary macro
purpose.

Required food roles:

- `carb`: primary carbohydrate source.
- `protein`: primary protein source.
- `fat`: primary fat source.

Do not add `mixed` or `other` roles for the current phase. If a food cannot be
reasonably assigned to one of the three roles, it should not be used in the
carb-cycle planner for now.

Expected food-library behavior:

- Food records should store a persistent macro role.
- Provider imports and manual food creation may suggest a role from macro
  dominance, but the user must be able to confirm or change it.
- The role is user-facing planning metadata. It should not change the real
  nutrition values of the food or its variants.

Expected per-meal selection behavior:

- Each meal can select at most one food per macro role:
  - one carb food,
  - one protein food,
  - one fat food.
- Selecting a carb row should search/filter carb foods.
- Selecting a protein row should search/filter protein foods.
- Selecting a fat row should search/filter fat foods.
- A role can be left empty. For example, a pre-workout meal can omit fat when
  the fat target is zero.

Recommended amount calculation:

- Do not solve a strict three-variable equation by default. Exact mathematical
  matching is fragile with real foods and can produce negative, impractical, or
  non-integer gram amounts.
- Use a priority-based recommendation algorithm instead.
- All nutrients from every selected food must still count toward the meal and
  daily actual totals, including non-primary nutrients.

Priority by carb-cycle day type:

- Low-carb day: guarantee protein first, then fat, then fill remaining carbs.
- Medium-carb day: guarantee protein first, then carbs, then fill remaining fat.
- High-carb day: guarantee protein first, then carbs, then fill remaining fat.

Calculation rule:

1. Start with the meal target: carbs, protein, fat.
2. Follow the day-type priority order.
3. For each macro role in that order, calculate the selected food amount from
   the remaining target for that macro.
4. After calculating a food amount, add all nutrients from that food to the
   running actual totals.
5. The next food uses the remaining macro target after accounting for previous
   foods' real nutrient contribution.
6. If a remaining macro target is already below zero, recommend zero amount for
   that role.

Example:

- Low-carb day: calculate protein food amount first, then fat food amount from
  remaining fat, then carb food amount from remaining carbs.
- Medium/high-carb day: calculate protein food amount first, then carb food
  amount from remaining carbs, then fat food amount from remaining fat.

Expected display:

- Show target, actual, and delta for carbs/protein/fat at meal and day level.
- Slight overages are acceptable and should not block saving.
- The user can manually adjust gram amounts after the recommendation if needed.

Reasoning:

- This matches the practical goal of carb cycling: low-carb days prioritize
  protein and fat, while medium/high-carb days prioritize protein and carbs.
- It keeps the planner simple: one food per macro role per meal.
- It avoids misleading precision from exact equation solving while still
  accounting for all real nutrient contributions.

## Open Questions For Discussion

1. Should Food Database import ever offer a follow-up quick-log action, or should
   it strictly stop at saving the food?
2. In MealBuilder, should `Add food or Meal` remain mixed, or should Food and Meal
   be split into separate tabs/buttons?
3. In carb-cycle Meal Plan, should we allow adding Meals at all, or only atomic
   Foods?
4. Should empty search in planning contexts show recent/top foods, or only show
   results after the user types?
5. Should Boohee be marked in the UI as a limited provider so users understand
   why it is only used as an All Providers fallback?
6. Should the macro role be required for all foods, or only required when a food
   is used in carb-cycle planning?

## Tentative Implementation Batch

No implementation has been done yet. If the direction above is approved, a
reasonable first batch would be:

1. Stop Food Database provider import from opening `FoodUnitSelector`.
2. Deduplicate `recentFoods + topFoods` in `EnhancedFoodSearch`.
3. Improve visual labels for Food versus Meal results.
4. Decide whether carb-cycle Meal Plan should hide Meal results by default.
5. Add Chinese food provider types and adapters:
   `china-food-composition`, `grocy`, and `boohee`.
6. Update All Providers search so Boohee is called only after all active
   non-limited providers return no results.
7. Add strict food macro roles for carb-cycle planning:
   `carb`, `protein`, and `fat`.
8. Update carb-cycle Meal Plan food selection so each meal has one selectable
   food slot per macro role.
9. Add priority-based recommended amount calculation:
   low-carb days use protein → fat → carb; medium/high-carb days use protein →
   carb → fat.
