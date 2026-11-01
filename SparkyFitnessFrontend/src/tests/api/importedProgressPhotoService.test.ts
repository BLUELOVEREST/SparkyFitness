import { apiCall } from '@/api/api';
import {
  fetchImportedProgressPhotos,
  importedProgressPhotoUrl,
} from '@/api/CheckIn/importedProgressPhotoService';
jest.mock('@/api/api', () => ({ apiCall: jest.fn(), API_BASE_URL: '/api' }));
const api = jest.mocked(apiCall);
it('fetches and validates owner-only metadata, dropping private path fields', async () => {
  const photo = {
    id: '22222222-2222-4222-8222-222222222222',
    entry_date: '2026-10-31',
    source: 'opengym',
  };
  api.mockResolvedValue([{ ...photo, private_path: '/secret' }]);
  expect(await fetchImportedProgressPhotos()).toEqual([photo]);
  expect(api).toHaveBeenCalledWith(
    '/integrations/sparkygym/progress-photos',
    expect.objectContaining({ method: 'GET' })
  );
  expect(importedProgressPhotoUrl(photo.id)).toBe(
    `/api/integrations/sparkygym/media/${photo.id}`
  );
});
it('rejects malformed dates instead of displaying untrusted rows', async () => {
  api.mockResolvedValue([
    {
      id: '22222222-2222-4222-8222-222222222222',
      entry_date: '2026-02-31',
      source: 'opengym',
    },
  ]);
  await expect(fetchImportedProgressPhotos()).rejects.toThrow();
});
