# Top-Level Kitchen Page Design

## Goal

Add a top-level Kitchen page to the Eric custom SparkyFitness flow. The page is a
read-only cooking and weighing view for the active carb-cycle meal plan.

This phase does not change Diary behavior. Diary optimization will be handled
after the Kitchen page is usable.

## User Problem

The user plans the next week in Meal Plan, then needs a fast cooking view in the
kitchen that answers:

- What day am I looking at?
- Is this a high, medium, or low carb day?
- What are today's total carb, protein, fat, and calorie targets?
- What meals exist today?
- For each meal, what foods should be weighed, and how many grams or units?

This should be available from the main navigation, not hidden inside Foods.

## Placement

Add a top-level `Kitchen` route:

- Route: `/kitchen`
- Desktop navigation: show `Kitchen` as a normal top tab.
- Mobile navigation: show `Kitchen` in the bottom bar because it is a high
  frequency in-kitchen action.
- Permission: show it to users/profiles that can access diary/food planning
  data. It should not be admin-only.

Recommended nav order:

- Desktop: Diary, Kitchen, Check-In, Cycle if enabled, Medications, Reports,
  Foods, Exercises, Goals, Settings.
- Mobile: Diary, Kitchen, Reports, Add, Settings.

## Data Source

Kitchen reads plan data. It must not read actual Diary food entries as its
primary source.

Use existing Meal Plan Template data:

- `meal_plan_templates`
- `meal_plan_template_assignments`
- `meal_plan_templates.macro_targets`

Frontend can use the existing `useMealPlanTemplates(activeUserId)` hook for the
first implementation:

1. Load the active template for the active user.
2. If multiple active templates somehow exist, use the one with the latest
   `start_date`, matching existing backend behavior.
3. If there is no active template, show an empty state with a link/button to
   Foods > Meal Plan.

No new table is required for this phase.

## Date And Week Logic

Kitchen is a weekly plan preview. It should follow the Eric carb-cycle week
semantics, not the original Sparky average-plan semantics.

Rules:

- The display week is Monday through Sunday.
- Default selected date is today if today belongs to the displayed active plan
  window.
- If today is outside the active plan window, select the active plan start date.
- The Monday/Sunday labels and day indices are calendar weekdays, not offsets
  from `start_date`.
- If the active plan `start_date` is Tuesday, Tuesday still maps to Tuesday's
  configured carb-cycle plan, not Day 1.

This preserves the already established carb-cycle behavior: `start_date` is when
the plan starts being active, not a day-index shift.

## Page Layout

The page should use SparkyFitness' existing UI components and visual language.

Desktop layout:

- Header: `Kitchen`, active plan name, selected date.
- Date tabs: Monday through Sunday, horizontally displayed.
- Today's tab remains visibly outlined when another date is selected.
- Daily summary card:
  - day type: Low Carb, Medium Carb, High Carb
  - calories
  - carbs
  - protein
  - fat
  - training summary if present in macro target source data
- Meal cards:
  - meal label, e.g. Breakfast, Pre-Workout, Post-Workout, Dinner
  - planned foods and quantities
  - per-meal target and planned total: C / P / F / kcal

Mobile layout:

- Same information, stacked vertically.
- Date tabs remain horizontally scrollable.
- Meal cards should prioritize food name and amount, not dense nutrient tables.

## What To Show Per Meal

For each selected date, group assignments by `day_of_week` and `meal_type`.

For carb-cycle mode:

- Use `macro_targets[dayIndex]` as the authoritative meal list and target order.
- Match assignments to each meal target by `meal_type`.
- Show only meals that exist in the day's macro target list. Rest days should
  show three meals if the target list contains three meals.
- If a target meal has no food assignments, show an empty planned-food message
  for that meal.

Food display:

- Atomic food: show food name, quantity, unit.
- Meal assignment: show meal name, quantity, unit.
- If nutrition values are available in the assignment or can be derived from
  existing loaded objects, show planned totals. If not, first implementation may
  show target totals only and leave planned totals as a later enhancement.

## Empty And Error States

No active plan:

- Show `No active meal plan`.
- Explain that Kitchen uses the active Meal Plan.
- Provide a button/link to `/foods` and tell the user to create or activate a
  Meal Plan.

Active plan without carb-cycle macro targets:

- Show a graceful fallback that this Kitchen view is optimized for carb-cycle
  plans.
- Still list assignments grouped by weekday if available.

API/loading error:

- Show an inline error card.
- Do not navigate away.

## Non-Goals For This Phase

- Do not write to Diary.
- Do not add `Log planned meal`.
- Do not edit Meal Plan from Kitchen.
- Do not introduce a new backend table.
- Do not change the original Sparky average meal-plan behavior.
- Do not optimize Diary carb-cycle recording yet.

## Testing

Frontend tests should cover:

- Kitchen route renders from the router.
- Top navigation includes Kitchen on desktop.
- Mobile navigation includes Kitchen.
- No active plan shows empty state.
- Active carb-cycle plan shows Monday-Sunday date tabs.
- Today remains outlined when a different date is selected.
- A Tuesday `start_date` does not shift Monday-Sunday carb-cycle mapping.
- Meal cards show selected food quantities from assignments.

## Implementation Notes

Likely files:

- `SparkyFitnessFrontend/src/App.tsx`
- `SparkyFitnessFrontend/src/layouts/MainLayout.tsx`
- `SparkyFitnessFrontend/src/pages/Kitchen/Kitchen.tsx`
- `SparkyFitnessFrontend/src/pages/Kitchen/kitchenPlanUtils.ts`
- `SparkyFitnessFrontend/src/tests/components/Kitchen.test.tsx`
- Existing meal plan hook/API files if small helper functions are needed.

Keep the first implementation read-only and front-end focused. Add backend
aggregation only if the frontend cannot reliably derive the view model from the
existing meal plan template payload.
