import { apiFetch } from '../../../src/services/api/apiClient';
import { fetchImportedProgressPhotos } from '../../../src/services/api/importedProgressPhotosApi';
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));
const api = jest.mocked(apiFetch);
it('uses the authenticated API client and validates imported photo metadata', async () => {
  const photo = {
    id: '22222222-2222-4222-8222-222222222222',
    entry_date: '2026-10-31',
    source: 'opengym',
  };
  api.mockResolvedValue([{ ...photo, private_path: '/secret' }]);
  expect(await fetchImportedProgressPhotos()).toEqual([photo]);
  expect(api).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: '/api/integrations/sparkygym/progress-photos',
    })
  );
});
it('rejects malformed metadata', async () => {
  api.mockResolvedValue([
    { id: 'not-a-uuid', entry_date: '2026-10-31', source: 'opengym' },
  ]);
  await expect(fetchImportedProgressPhotos()).rejects.toThrow();
});
