BEGIN;

INSERT INTO public.external_provider_types (
  id, display_name, description, categories, required_fields, field_labels, supports_barcode, is_strictly_private
)
VALUES (
  'china-food-composition',
  '中国食物成分表',
  'Bundled Chinese Food Composition data for Chinese ingredient search.',
  ARRAY['food'],
  ARRAY[]::VARCHAR[],
  '{}'::jsonb,
  FALSE,
  FALSE
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  categories = EXCLUDED.categories,
  required_fields = EXCLUDED.required_fields,
  field_labels = EXCLUDED.field_labels,
  supports_barcode = EXCLUDED.supports_barcode,
  is_strictly_private = EXCLUDED.is_strictly_private;

INSERT INTO public.external_data_providers (
  user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
)
SELECT id, '中国食物成分表', 'china-food-composition', TRUE, TRUE, now(), now()
FROM public."user"
WHERE role = 'admin'
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id, provider_name) DO UPDATE SET
  provider_type = EXCLUDED.provider_type,
  is_active = TRUE,
  is_public = TRUE,
  updated_at = now();

COMMIT;
