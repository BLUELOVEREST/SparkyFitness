import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import SparkyGymSettings from '../../src/components/SparkyGymSettings';
import type { SparkyGymConnectionStatus } from '@workspace/shared';

let mockConfig = { id: 'server', authType: 'session', sessionToken: 'session' };
let mockConnections: SparkyGymConnectionStatus[] = [];
jest.mock('../../src/localization', () => ({
  formatLocalizedNumber: (value: number) => String(value),
}));
jest.mock('../../src/hooks/useServerConfigs', () => ({
  useServerConfigs: () => ({ activeConfig: mockConfig }),
}));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { id: 'signed-in-owner' } }),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(() => ({
    data: { connections: mockConnections },
    refetch: jest.fn(),
    isPending: false,
    isError: false,
  })),
}));
jest.mock('@workspace/shared', () => ({
  sparkyGymResources: ['exercise', 'workout'],
  sparkyGymDeliveryStatusSchema:
    jest.requireActual('@workspace/shared').sparkyGymDeliveryStatusSchema,
}));
jest.mock('../../src/services/api/sparkyGymApi', () => ({
  getSparkyGymStatus: jest.fn(),
  createSparkyGymInvitation: jest.fn(),
  controlSparkyGym: jest.fn(),
}));
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));
jest.mock('../../src/components/Icon', () => () => null);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; value?: string }) =>
      (options?.defaultValue ?? key).replace('{{value}}', options?.value ?? ''),
  }),
}));
jest.mock('uniwind', () => ({ useCSSVariable: () => '#111111' }));

describe('openGym session owner panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { id: 'server', authType: 'session', sessionToken: 'session' };
    mockConnections = [];
  });
  it('does not mount management queries for API keys', () => {
    mockConfig = { ...mockConfig, authType: 'apiKey' };
    const screen = render(<SparkyGymSettings />);
    expect(screen.queryByText('openGym')).toBeNull();
    expect(useQuery).not.toHaveBeenCalled();
  });
  it('keys owner state by the actual profile and requires explicit expansion', () => {
    const screen = render(<SparkyGymSettings />);
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['sparkyGym', 'server', 'signed-in-owner'],
        enabled: false,
      })
    );
    fireEvent.press(screen.getByText('openGym'));
    expect(useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true })
    );
    expect(screen.getByText('openGym origin')).toBeTruthy();
    expect(screen.getByText('No openGym connections')).toBeTruthy();
  });
  it('keeps active connection status visible alongside delivery failures', () => {
    mockConnections = [
      {
        connection_id: '00000000-0000-4000-8000-000000000001',
        status: 'active',
        peer_origin: 'https://gym.example',
        peer_owner_ref: 'peer-owner',
        scopes: ['workout'],
        include_history: false,
        affected_record_counts: { workout: 7 },
        capabilities: null,
        delivery: {
          pending: 4,
          failed: 2,
          pending_media: 3,
          last_success_at: null,
          last_error_code: 'INVALID_PAYLOAD',
        },
      },
    ];
    const screen = render(<SparkyGymSettings />);
    fireEvent.press(screen.getByText('openGym'));
    expect(screen.getByText(/Active/)).toBeTruthy();
    expect(screen.getByText('Pending: 4')).toBeTruthy();
    expect(screen.getByText('Failed: 2')).toBeTruthy();
    expect(screen.getByText('Pending media: 3')).toBeTruthy();
    expect(screen.getByText('INVALID_PAYLOAD')).toBeTruthy();
  });
});
