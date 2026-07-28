# Exercise Sync Provider Notes

Date: 2026-07-17

This note records the current decision around exercise sync for the Eric custom flow. It is intentionally scoped as a design/operation note, not an implementation plan.

## Core Conclusion

SparkyFitness can directly sync Google Health Connect data through the Android app.

The practical chain for the current workflow is:

```text
Hevy -> Health Connect -> SparkyFitness Android App -> SparkyFitness Server
```

This is viable for importing workout sessions, but Health Connect does not currently give SparkyFitness a clean structured strength-training model that maps directly to exercise name, weight, reps, and sets.

For Hevy strength workouts, the useful details are preserved as raw Health Connect data / notes, not as fully parsed SparkyFitness exercise entries.

## Hevy API Path

SparkyFitness also has a direct Hevy integration path.

Current behavior in source:

- It requires a Hevy API key.
- The API key is entered in the external provider settings.
- It calls Hevy API endpoints directly and imports workouts as structured exercise entries.

Open question:

- Publicly accessible Hevy API documentation confirms API-key based access, but does not clearly state whether API keys require Hevy Pro.
- If the Hevy app only exposes `Settings > API Key` to Pro users, then direct Hevy sync effectively requires Hevy Pro.

Decision for now:

- Do not depend on direct Hevy API as the main workflow.
- Keep Health Connect as the realistic no-Pro path.
- Re-evaluate after real-world usage or after confirming Hevy Pro/API access.

## Other Exercise-Related Providers

These providers should not be treated as replacements for Hevy-style strength-training logs.

### Withings

Withings is mainly a smart health-device platform.

Typical data:

- Weight
- Body fat
- Blood pressure
- Heart rate
- Sleep

It is not suitable for detailed strength training sets, reps, and weight.

### Polar Flow

Polar Flow is primarily for Polar watches and heart-rate devices.

Typical data:

- Running, cycling, swimming, and endurance sessions
- Heart-rate zones
- Duration
- Calories

It is not a good source for detailed gym exercise structure.

### Strava

Strava is mainly for endurance activities and social workout tracking.

Typical data:

- Route
- Distance
- Pace
- Elevation
- Power
- Heart rate

Strength training may appear as a generic activity, but it is not expected to carry detailed exercise/set/weight data.

## Provider Categories In SparkyFitness

There are two different concepts that should not be mixed:

### Exercise Library Providers

Used to search/import exercise definitions into the local exercise database.

Relevant providers:

- Wger
- Free Exercise DB
- Nutritionix, but this is more useful for activity/calorie estimation than a clean strength-training movement library.

### Exercise Data Sync Providers

Used to sync activity or health records.

Relevant providers:

- Health Connect
- Apple Health
- Garmin Connect
- Fitbit
- Withings
- Polar Flow
- Strava
- Hevy

## Current Direction

For the current custom flow, the recommended direction is:

```text
Hevy writes workout -> Health Connect
SparkyFitness Android app syncs Health Connect -> server
Custom parser reads raw Health Connect / Hevy notes
Parser maps Chinese Hevy exercise names -> SparkyFitness exercises
Parser writes structured exercise entries
```

This keeps the system separated from Hevy Pro/API availability and avoids relying on a provider that may be gated or unstable.

## Future Review Points

After real usage, review:

- Whether Health Connect sync is reliable enough day to day.
- Whether Hevy raw notes remain stable enough to parse.
- Whether SparkyFitness upstream improves Health Connect strength-training parsing.
- Whether direct Hevy API access is available and worth using.
- Whether mapped exercise entries are accurate enough for long-term reports.
