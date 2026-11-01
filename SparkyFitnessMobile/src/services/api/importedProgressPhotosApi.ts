import { importedProgressPhotoListSchema } from '@workspace/shared';
import { apiFetch } from './apiClient';

export const importedProgressPhotosRootKey = [
  'imported-progress-photos',
] as const;

export async function fetchImportedProgressPhotos() {
  const response = await apiFetch<unknown>({
    endpoint: '/api/integrations/sparkygym/progress-photos',
    serviceName: 'Imported Progress Photos API',
    operation: 'fetch imported progress photos',
  });
  return importedProgressPhotoListSchema.parse(response);
}
