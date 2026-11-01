import { TextDecoder } from 'node:util';
import { render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import SparkyGymNotifications from '../../src/components/SparkyGymNotifications';

const mockInvalidate = jest.fn(
  async (options: {
    predicate: (query: { queryKey: readonly unknown[] }) => boolean;
  }) => {
    void options;
  }
);
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../src/hooks/useServerConfigs', () => ({
  useServerConfigs: () => ({
    activeConfig: { id: 'server', url: 'https://sf', authType: 'session' },
  }),
}));
jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: () => ({ isConnected: true }),
}));
jest.mock('../../src/services/api/authService', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test-session' }),
  notifySessionExpired: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  proxyHeadersToRecord: () => ({}),
}));

it('invalidates imported progress photos on a committed event without polling', async () => {
  const previousState = AppState.currentState;
  const previousDecoder = globalThis.TextDecoder;
  AppState.currentState = 'active';
  Object.defineProperty(globalThis, 'TextDecoder', {
    configurable: true,
    value: TextDecoder,
  });
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  const packet = Uint8Array.from(
    'id: 1\nevent: committed\ndata: {}\n\n',
    (char) => char.charCodeAt(0)
  );
  const reader = {
    read: jest
      .fn()
      .mockResolvedValueOnce({ done: false, value: packet })
      .mockResolvedValue({ done: true }),
    cancel: jest.fn().mockResolvedValue(undefined),
    releaseLock: jest.fn(),
  };
  jest.mocked(expoFetch).mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: { getReader: () => reader },
  } as unknown as Awaited<ReturnType<typeof expoFetch>>);
  const view = render(<SparkyGymNotifications />);
  try {
    await waitFor(() => expect(mockInvalidate).toHaveBeenCalled());
    const predicate = mockInvalidate.mock.calls[0][0].predicate;
    expect(
      predicate({ queryKey: ['imported-progress-photos', 'server', 'owner'] })
    ).toBe(true);
    expect(predicate({ queryKey: ['unrelated'] })).toBe(false);
    expect(expoFetch).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    listener.mockRestore();
    AppState.currentState = previousState;
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: previousDecoder,
    });
  }
});
