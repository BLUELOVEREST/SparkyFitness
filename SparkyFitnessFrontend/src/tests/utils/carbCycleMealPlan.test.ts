import { buildCarbCycleMealPlanDraft } from '@/utils/carbCycleMealPlan';
import type { CarbCycleWeekResult } from '@/types/goals';

describe('buildCarbCycleMealPlanDraft', () => {
  it('creates a native meal plan template draft and day target map', () => {
    const preview: CarbCycleWeekResult = {
      weekStartDate: '2026-07-06',
      weekTotals: { calories: 14213, carbs: 1470, protein: 980, fat: 490 },
      days: [
        {
          date: '2026-07-06',
          dayType: 'low',
          calories: 2104,
          carbs: 110.25,
          protein: 140,
          fat: 122.5,
          trainingSlot: 'morning',
          meals: [
            {
              slotKey: 'morning',
              label: 'Pre-Workout',
              calories: 346,
              carbs: 51.5,
              protein: 35,
              fat: 0,
            },
            {
              slotKey: 'noon',
              label: 'Post-Workout',
              calories: 494,
              carbs: 68.6,
              protein: 42,
              fat: 5.7,
            },
          ],
        },
      ],
    };

    const result = buildCarbCycleMealPlanDraft(preview);

    expect(result.template).toEqual({
      plan_name: 'Carb Cycle 2026-07-06',
      description:
        'Generated from carb cycle targets. Add foods or meals to each target meal.',
      start_date: '2026-07-06',
      end_date: '2026-07-12',
      is_active: false,
      assignments: [],
    });
    expect(result.mealTargetsByDay).toEqual({
      1: preview.days[0]!.meals,
    });
  });
});
