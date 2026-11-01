import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import ImportedProgressPhotos from '../../src/components/ImportedProgressPhotos';
let mockServerId = 'server-a';
let mockOwnerId: string | undefined = 'owner-a';
jest.mock('../../src/hooks/useServerConfigs', () => ({
  useServerConfigs: () => ({
    activeConfig: { id: mockServerId, url: 'https://sf' },
  }),
}));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: mockOwnerId ? { id: mockOwnerId } : undefined,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/useAuthedImageSource', () => ({
  useAuthedImageSource: () => ({
    getPhotoSource: (id: string) => ({
      uri: `https://sf/api/integrations/sparkygym/media/${id}`,
      headers: { Authorization: 'Bearer test' },
    }),
  }),
}));
jest.mock('../../src/services/api/importedProgressPhotosApi', () => ({
  fetchImportedProgressPhotos: jest.fn(),
  importedProgressPhotosRootKey: ['imported-progress-photos'],
}));
const query = jest.mocked(useQuery);
beforeEach(() => {
  mockServerId = 'server-a';
  mockOwnerId = 'owner-a';
  query.mockReturnValue({
    data: [{ id: 'id', entry_date: '2026-10-31', source: 'opengym' }],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>);
});
it('scopes metadata to the active server and owner without polling', () => {
  const { rerender } = render(<ImportedProgressPhotos />);
  const first = query.mock.calls.at(-1)?.[0];
  expect(first).not.toHaveProperty('refetchInterval');
  expect(first?.queryKey).toEqual([
    'imported-progress-photos',
    'server-a',
    'https://sf',
    'owner-a',
  ]);
  mockServerId = 'server-b';
  mockOwnerId = 'owner-b';
  rerender(<ImportedProgressPhotos />);
  expect(query.mock.calls.at(-1)?.[0].queryKey).toEqual([
    'imported-progress-photos',
    'server-b',
    'https://sf',
    'owner-b',
  ]);
});
it('does not query or show cached photos before owner identity is available', () => {
  mockOwnerId = undefined;
  const { queryByText } = render(<ImportedProgressPhotos />);
  expect(queryByText('2026-10-31')).toBeNull();
  expect(query.mock.calls.at(-1)?.[0].enabled).toBe(false);
});
it('shows existing dated photos read-only and opens the private viewer', () => {
  const { getByLabelText, queryByText, getAllByText } = render(
    <ImportedProgressPhotos />
  );
  expect(getAllByText('2026-10-31')).toHaveLength(1);
  expect(queryByText(/Remove|Replace|Upload/)).toBeNull();
  fireEvent.press(getByLabelText('View openGym photo from 2026-10-31'));
  expect(getByLabelText('Close')).toBeTruthy();
});
it('hides stale gallery data when refreshing fails', () => {
  query.mockReturnValue({
    data: [{ id: 'id', entry_date: '2026-10-31' }],
    isPending: false,
    isError: true,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useQuery>);
  const { queryByText, getByText } = render(<ImportedProgressPhotos />);
  expect(queryByText('2026-10-31')).toBeNull();
  expect(getByText('Could not load imported photos.')).toBeTruthy();
});
