import { act, renderHook } from '@testing-library/react';
import { useSparkyGymNotifications } from '@/hooks/Integrations/useSparkyGymNotifications';
const invalidateQueries = jest.fn();
let delegate = false;
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: delegate }),
}));
describe('owner notification replay', () => {
  const listeners = new Map<string, (event: Partial<MessageEvent>) => void>();
  const close = jest.fn();
  const Source = jest.fn().mockImplementation(() => ({
    close,
    addEventListener: (
      event: string,
      listener: (event: Partial<MessageEvent>) => void
    ) => listeners.set(event, listener),
  }));
  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    delegate = false;
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      writable: true,
      value: Source,
    });
  });
  it('deduplicates committed replay IDs and closes on unmount', () => {
    const { unmount } = renderHook(() => useSparkyGymNotifications());
    act(() =>
      listeners.get('committed')?.({ type: 'committed', lastEventId: '4' })
    );
    act(() =>
      listeners.get('committed')?.({ type: 'committed', lastEventId: '4' })
    );
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
    const predicate = invalidateQueries.mock.calls[0][0].predicate as (query: {
      queryKey: string[];
    }) => boolean;
    for (const root of [
      'exerciseEntries',
      'dailyProgress',
      'exercises',
      'reports',
      'checkIn',
      'imported-progress-photos',
    ])
      expect(predicate({ queryKey: [root] })).toBe(true);
    unmount();
    expect(close).toHaveBeenCalled();
  });
  it('does not subscribe while delegated', () => {
    delegate = true;
    renderHook(() => useSparkyGymNotifications());
    expect(Source).not.toHaveBeenCalled();
  });
  it('invalidates imported photos on snapshot recovery', () => {
    renderHook(() => useSparkyGymNotifications());
    act(() =>
      listeners.get('snapshot-required')?.({ type: 'snapshot-required' })
    );
    const predicate = invalidateQueries.mock.calls[0][0].predicate as (query: {
      queryKey: string[];
    }) => boolean;
    expect(predicate({ queryKey: ['imported-progress-photos', 'owner'] })).toBe(
      true
    );
    expect(predicate({ queryKey: ['unrelated'] })).toBe(false);
  });
});
