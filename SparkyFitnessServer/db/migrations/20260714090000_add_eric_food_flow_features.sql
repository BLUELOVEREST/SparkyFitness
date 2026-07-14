BEGIN;

INSERT INTO public.external_provider_types (
  id, display_name, description, categories, required_fields, field_labels, supports_barcode, is_strictly_private
)
VALUES
  (
    'china-food-composition',
    '中国食物成分表',
    'Bundled Chinese Food Composition data for Chinese ingredient search.',
    ARRAY['food'],
    ARRAY[]::VARCHAR[],
    '{}'::jsonb,
    FALSE,
    FALSE
  ),
  (
    'boohee',
    '薄荷',
    'Boohee Open API food search. Uses limited API calls and is used as All Providers fallback.',
    ARRAY['food'],
    ARRAY['app_key'],
    '{"app_key": "Boohee API Key"}'::jsonb,
    FALSE,
    TRUE
  ),
  (
    'grocy',
    'Grocy',
    'Self-hosted Grocy recipe nutrition provider.',
    ARRAY['food'],
    ARRAY['base_url', 'app_key'],
    '{"base_url": "Grocy URL", "app_key": "Grocy API Key"}'::jsonb,
    FALSE,
    TRUE
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  categories = EXCLUDED.categories,
  required_fields = EXCLUDED.required_fields,
  field_labels = EXCLUDED.field_labels,
  supports_barcode = EXCLUDED.supports_barcode,
  is_strictly_private = EXCLUDED.is_strictly_private;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS macro_role TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'foods_macro_role_check'
      AND conrelid = 'public.foods'::regclass
  ) THEN
    ALTER TABLE public.foods
      ADD CONSTRAINT foods_macro_role_check
      CHECK (macro_role IS NULL OR macro_role IN ('carb', 'protein', 'fat'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_global_default_providers(p_admin_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Free Exercise DB', 'free-exercise-db', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE, is_active = TRUE;

  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Wger', 'wger', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE, is_active = TRUE;

  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Open Food Facts', 'openfoodfacts', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE, is_active = TRUE;

  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Swiss Food Database', 'swissfood', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE, is_active = TRUE;

  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, '中国食物成分表', 'china-food-composition', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE, is_active = TRUE;
END;
$$;

DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id
  FROM public."user"
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    PERFORM public.create_global_default_providers(v_admin_id);
  END IF;
END $$;

COMMIT;
