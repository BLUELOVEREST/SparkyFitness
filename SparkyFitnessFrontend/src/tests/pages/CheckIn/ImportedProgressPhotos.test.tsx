import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useImportedProgressPhotos } from '@/hooks/CheckIn/useImportedProgressPhotos';
import { ImportedProgressPhotos } from '@/pages/CheckIn/ImportedProgressPhotos';

jest.mock('@/hooks/CheckIn/useImportedProgressPhotos', () => ({
  useImportedProgressPhotos: jest.fn(),
}));
const query = jest.mocked(useImportedProgressPhotos);
const photo = {
  id: 'media-id',
  entry_date: '2026-10-31',
  source: 'opengym' as const,
};
const photoUrl = (id: string) => `/api/integrations/sparkygym/media/${id}`;
function result(data = [photo], enabled = true) {
  query.mockReturnValue({
    photos: data,
    enabled,
    photoUrl,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useImportedProgressPhotos>);
}
beforeEach(() => {
  jest.clearAllMocks();
  result();
});

it('shows dated imports without native upload/delete actions and opens the authenticated image', () => {
  render(<ImportedProgressPhotos />);
  expect(screen.getByText('2026-10-31')).toBeInTheDocument();
  expect(screen.getByRole('img')).toHaveAttribute(
    'src',
    '/api/integrations/sparkygym/media/media-id'
  );
  expect(
    screen.queryByRole('button', { name: /remove|replace|upload/i })
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /2026-10-31/ }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('hides cached imports when the owner hook is disabled', () => {
  result([photo], false);
  render(<ImportedProgressPhotos />);
  expect(screen.queryByRole('img')).toBeNull();
});
it('does not show a gallery when no imports exist', () => {
  result([]);
  const { container } = render(<ImportedProgressPhotos />);
  expect(container).toBeEmptyDOMElement();
});

it('hides stale metadata on failure and offers retry', () => {
  const refetch = jest.fn();
  query.mockReturnValue({
    photos: [photo],
    enabled: true,
    photoUrl,
    isPending: false,
    isError: true,
    refetch,
  } as unknown as ReturnType<typeof useImportedProgressPhotos>);
  render(<ImportedProgressPhotos />);
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(refetch).toHaveBeenCalled();
});

it('closes a viewed photo when it disappears from the refreshed list', () => {
  const { rerender } = render(<ImportedProgressPhotos />);
  fireEvent.click(screen.getByRole('button', { name: /2026-10-31/ }));
  result([]);
  rerender(<ImportedProgressPhotos />);
  expect(screen.queryByRole('dialog')).toBeNull();
});
