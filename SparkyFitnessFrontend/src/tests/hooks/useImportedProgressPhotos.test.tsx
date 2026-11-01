import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fetchImportedProgressPhotos } from '@/api/CheckIn/importedProgressPhotoService';
import { useImportedProgressPhotos } from '@/hooks/CheckIn/useImportedProgressPhotos';

let activeUserId: string | null = 'owner';
let delegated = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId, isActingOnBehalf: delegated }),
}));
jest.mock('@/api/CheckIn/importedProgressPhotoService', () => ({
  ...jest.requireActual('@/api/CheckIn/importedProgressPhotoService'),
  fetchImportedProgressPhotos: jest.fn(),
}));
const fetchPhotos = jest.mocked(fetchImportedProgressPhotos);
const photo = {
  id: 'media-id',
  entry_date: '2026-10-31',
  source: 'opengym' as const,
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
beforeEach(() => {
  activeUserId = 'owner';
  delegated = false;
  fetchPhotos.mockReset();
  fetchPhotos.mockResolvedValue([photo]);
});

it('owns the query, owner key and authenticated image URLs without polling', async () => {
  const interval = jest.spyOn(window, 'setInterval');
  const { client, wrapper } = setup();
  try {
    const { result } = renderHook(() => useImportedProgressPhotos(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.photos).toEqual([photo]));
    expect(client.getQueryData(['imported-progress-photos', 'owner'])).toEqual([
      photo,
    ]);
    expect(result.current.photoUrl(photo.id)).toBe(
      '/api/integrations/sparkygym/media/media-id'
    );
    expect(interval.mock.calls.some(([, delay]) => delay === 30_000)).toBe(
      false
    );
  } finally {
    interval.mockRestore();
    client.clear();
  }
});

it('hides cached photos and disables requests while delegated or identity is missing', () => {
  const { client, wrapper } = setup();
  client.setQueryData(['imported-progress-photos', 'owner'], [photo]);
  delegated = true;
  const { result, rerender } = renderHook(() => useImportedProgressPhotos(), {
    wrapper,
  });
  expect(result.current.enabled).toBe(false);
  expect(result.current.photos).toBeUndefined();
  expect(fetchPhotos).not.toHaveBeenCalled();
  delegated = false;
  activeUserId = null;
  rerender();
  expect(result.current.enabled).toBe(false);
  expect(result.current.photos).toBeUndefined();
  expect(fetchPhotos).not.toHaveBeenCalled();
  client.clear();
});

it('refetches through the existing notification root invalidation', async () => {
  const { client, wrapper } = setup();
  const { result } = renderHook(() => useImportedProgressPhotos(), { wrapper });
  await waitFor(() => expect(result.current.photos).toEqual([photo]));
  fetchPhotos.mockResolvedValue([]);
  await act(() =>
    client.invalidateQueries({ queryKey: ['imported-progress-photos'] })
  );
  await waitFor(() => expect(result.current.photos).toEqual([]));
  client.clear();
});
