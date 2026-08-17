BEGIN;

INSERT INTO public.external_provider_types (
  id, display_name, description, categories, required_fields, field_labels, supports_barcode, is_strictly_private
)
VALUES (
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
    INSERT INTO public.external_data_providers (
      user_id, provider_name, provider_type, is_active, is_public, base_url, sync_frequency, created_at, updated_at
    ) VALUES (
      v_admin_id, 'Grocy', 'grocy', FALSE, TRUE, NULL, 'manual', now(), now()
    )
    ON CONFLICT (user_id, provider_name) DO UPDATE SET
      provider_type = EXCLUDED.provider_type,
      is_public = TRUE,
      sync_frequency = COALESCE(public.external_data_providers.sync_frequency, EXCLUDED.sync_frequency),
      updated_at = now()
    WHERE public.external_data_providers.provider_type = 'grocy';
  END IF;
END $$;

COMMIT;
