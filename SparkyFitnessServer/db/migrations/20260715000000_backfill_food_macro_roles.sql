UPDATE foods f
SET macro_role = CASE
  WHEN COALESCE(fv.carbs, 0) <= 0
    AND COALESCE(fv.protein, 0) <= 0
    AND COALESCE(fv.fat, 0) <= 0 THEN NULL
  WHEN COALESCE(fv.carbs, 0) >= COALESCE(fv.protein, 0)
    AND COALESCE(fv.carbs, 0) >= COALESCE(fv.fat, 0) THEN 'carb'
  WHEN COALESCE(fv.protein, 0) >= COALESCE(fv.carbs, 0)
    AND COALESCE(fv.protein, 0) >= COALESCE(fv.fat, 0) THEN 'protein'
  ELSE 'fat'
END
FROM food_variants fv
WHERE fv.food_id = f.id
  AND fv.is_default = TRUE
  AND f.macro_role IS NULL;
