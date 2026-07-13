import { getClient } from '../db/poolManager.js';

export interface MealMacroTargetInput {
  goal_date: string;
  slot_key: string;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

async function replaceMealMacroTargetsForWeek(
  userId: string,
  startDate: string,
  endDate: string,
  targets: MealMacroTargetInput[]
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM user_goal_meal_macro_targets
       WHERE user_id = $1
         AND goal_date BETWEEN $2 AND $3`,
      [userId, startDate, endDate]
    );

    const inserted = [];
    for (const target of targets) {
      const result = await client.query(
        `INSERT INTO user_goal_meal_macro_targets (
          user_id, goal_date, slot_key, label, calories, protein, carbs, fat
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          userId,
          target.goal_date,
          target.slot_key,
          target.label,
          target.calories,
          target.protein,
          target.carbs,
          target.fat,
        ]
      );
      inserted.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return inserted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getMealMacroTargetsForRange(
  userId: string,
  startDate: string,
  endDate: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT goal_date, slot_key, label, calories, protein, carbs, fat
       FROM user_goal_meal_macro_targets
       WHERE user_id = $1
         AND goal_date BETWEEN $2 AND $3
       ORDER BY goal_date ASC,
         CASE slot_key
           WHEN 'morning' THEN 1
           WHEN 'noon' THEN 2
           WHEN 'afternoon' THEN 3
           WHEN 'evening' THEN 4
           ELSE 5
         END`,
      [userId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export { replaceMealMacroTargetsForWeek };
export { getMealMacroTargetsForRange };
export default {
  replaceMealMacroTargetsForWeek,
  getMealMacroTargetsForRange,
};
