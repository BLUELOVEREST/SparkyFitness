## Measurements Tab

### Built-in Circumferences

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

### Historical Data
- **Trend Charts**: Interactive charts showing measurement trends over time
- **Date Range Selection**: Custom time period analysis
- **Multiple Metrics**: Compare different measurements on same chart
- **Goal Overlays**: Show target measurements vs actual progress

### Analytics
- **Progress Calculation**: Automatic progress percentages
- **Milestone Tracking**: Achievement notifications
- **Trend Analysis**: Identify patterns and plateaus
- **Correlation Analysis**: Relationship between different metrics
