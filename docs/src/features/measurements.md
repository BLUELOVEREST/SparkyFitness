# Measurements

The **Measurements** tab of the [Check-In](/features/check-in) page is where you log your body metrics. Everything you log here shows up as trend charts in [Reports](/features/reports).

## Built-in fields

For **Weight**, **Height**, **Neck**, **Waist**, **Hips**, and **Body Fat %**, a **Use Last** button appears whenever the field is empty and a previous value exists, so logging daily takes seconds:

| Field | Notes |
| --- | --- |
| **Weight** | In your preferred unit (kg or lbs) |
| **Height** | In cm or inches |
| **Steps** | Your daily step count |
| **Neck**, **Waist**, **Hips** | Tape measurements |
| **Body Fat %** | Enter it directly, or press **Calculate** to estimate it from your measurements (tick **Use Recent** to have the estimate fill missing fields with your latest values) |
| **Muscle Mass** | From a body-composition analyzer |
| **Bone Mass** | From a body-composition analyzer |
| **Body Water %** | From a body-composition analyzer |
| **BMR (kcal)** | Your resting metabolic rate, if you have a measured value |

Fill in whatever you have: you don't need to complete every field. Press **Save Check-In** when you're done.

## Built-in Circumferences

Check-in entry, visibility settings and reports support 18 built-in circumference
fields: neck, shoulders, chest, waist, hips, abdomen, and left/right upper arm,
forearm, wrist, thigh, calf and ankle. These are ordinary check-in measurements,
not custom categories. Storage and synchronization use centimeters; entry and
reports convert inches at the display boundary.

The existing `left_biceps` and `right_biceps` keys remain unchanged for history
compatibility. They mean upper-arm circumference, not muscle mass or a separate
flexed-biceps protocol. Existing readings are not recalculated. Additional tape
measurements do not change the body-fat algorithms or their required inputs.

For openGym, the explicit SF-to-native mapping is:

| SF stored/wire key | openGym native metric |
| --- | --- |
| `neck` | `neck` |
| `shoulders` | `shoulders` |
| `chest` | `chest` |
| `waist` | `waist` |
| `hips` | `hips` |
| `abdomen` | `abdomen` |
| `left_biceps` | `upper_arm_left` |
| `right_biceps` | `upper_arm_right` |
| `left_forearm` | `forearm_left` |
| `right_forearm` | `forearm_right` |
| `left_wrist` | `wrist_left` |
| `right_wrist` | `wrist_right` |
| `left_thigh` | `thigh_left` |
| `right_thigh` | `thigh_right` |
| `left_calf` | `calf_left` |
| `right_calf` | `calf_right` |
| `left_ankle` | `ankle_left` |
| `right_ankle` | `ankle_right` |

Only supplied fields change when saving part of a day. An explicit null clears a
field; other daily readings remain unchanged. BODY capture and history snapshots
include the six new fields, including deletion events for cleared values.

## Historical Data
- **Trend Charts**: Interactive charts showing measurement trends over time
- **Date Range Selection**: Custom time period analysis
- **Multiple Metrics**: Compare different measurements on same chart
- **Goal Overlays**: Show target measurements vs actual progress

## Analytics
- **Progress Calculation**: Automatic progress percentages
- **Milestone Tracking**: Achievement notifications
- **Trend Analysis**: Identify patterns and plateaus
- **Correlation Analysis**: Relationship between different metrics

## Custom categories

The built-in fields don't cover everything you track. Create your own categories under **Settings → Wellness → Custom Categories**:

- Give each category a name, a unit, and a type (**numeric** or **text**)
- Every category then appears on the Measurements tab with its own input (and a **Use Last** button when empty if a previous value exists)
- Numeric entries can carry a short note (for example, the machine or circumstances of the reading)
- Each custom category gets its own trend chart in Reports

## Recent measurements

Below the form, the **Recent Measurements** list shows your latest logged weight, body metrics, and custom-category entries. You can delete entries you logged by mistake.

## See your progress

- Open **Reports → Measurements** for a chart per metric, including every custom category
- Switch to the table view, pick **Body Measurements** (or a custom category), and use **Download (CSV)** to export the full history

> [!TIP]
> Weigh yourself on the same day and at the same time of day for the cleanest trend. Day-to-day noise is normal: the charts smooth it out over weeks.

## Related pages

- [Check-In](/features/check-in)
- [Reports](/features/reports)
- [User Settings](/features/user-settings)
- [Goals](/features/goals)
