import { importedProgressPhotoListSchema } from '@workspace/shared';
import { API_BASE_URL, apiCall } from '@/api/api';

export async function fetchImportedProgressPhotos() {
  const response: unknown = await apiCall(
    '/integrations/sparkygym/progress-photos',
    {
      method: 'GET',
      suppressErrorToast: true,
    }
  );
  return importedProgressPhotoListSchema.parse(response);
}

export const importedProgressPhotoUrl = (id: string): string =>
  `${API_BASE_URL}/integrations/sparkygym/media/${encodeURIComponent(id)}`;
