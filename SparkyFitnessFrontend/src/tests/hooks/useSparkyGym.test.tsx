import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SparkyGymInvitationResponse } from '@workspace/shared';
import { useSparkyGym } from '@/hooks/Integrations/useSparkyGym';
import {
  createSparkyGymInvitation,
  getSparkyGymStatus,
} from '@/api/Integrations/sparkyGym';
jest.mock('@/api/Integrations/sparkyGym', () => ({
  getSparkyGymStatus: jest.fn(),
  createSparkyGymInvitation: jest.fn(),
  controlSparkyGym: jest.fn(),
}));

describe('owner management query boundary', () => {
  it('never puts a one-time invitation in the query or mutation cache', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const response: SparkyGymInvitationResponse = {
      connection: {
        connection_id: '00000000-0000-4000-8000-000000000001',
        status: 'invited',
        peer_origin: 'https://gym.example',
        peer_owner_ref: null,
        scopes: ['workout'],
        include_history: false,
        affected_record_counts: {},
        capabilities: null,
        delivery: {
          pending: 0,
          failed: 0,
          pending_media: 0,
          last_success_at: null,
          last_error_code: null,
        },
      },
      invitation: {
        version: 1,
        connection_id: '00000000-0000-4000-8000-000000000001',
        sf_owner_ref: 'owner',
        sf_origin: 'https://fitness.example',
        sf_nonce: 'n'.repeat(43),
        secret: 's'.repeat(43),
        expires_at: '2026-10-29T12:00:00.000Z',
        peer_origin: 'https://gym.example',
        scopes: ['workout'],
        include_history: false,
      },
    };
    jest.mocked(getSparkyGymStatus).mockResolvedValue({ connections: [] });
    jest.mocked(createSparkyGymInvitation).mockResolvedValue(response);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useSparkyGym('owner'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => {
      expect(
        await result.current.createInvitation({
          peer_origin: 'https://gym.example',
          scopes: ['workout'],
          include_history: false,
          allow_http: false,
          allow_private_network: false,
        })
      ).toEqual(response);
    });
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data)
      )
    ).not.toContain(response.invitation.secret);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(client.getQueryCache().getAll()[0]?.queryKey).toEqual([
      'sparkyGym',
      'owner',
    ]);
    unmount();
    client.clear();
  });
});
