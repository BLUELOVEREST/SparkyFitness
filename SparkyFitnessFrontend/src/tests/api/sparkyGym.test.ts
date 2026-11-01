import { apiCall } from '@/api/api';
import {
  createSparkyGymInvitation,
  getSparkyGymStatus,
  controlSparkyGym,
} from '@/api/Integrations/sparkyGym';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
const request = {
  peer_origin: 'https://gym.example',
  self_origin: 'http://192.168.200.118:3006',
};
describe('SparkyGym owner API', () => {
  it('rejects missing delivery diagnostics instead of manufacturing healthy counts', async () => {
    jest.mocked(apiCall).mockResolvedValue({
      connections: [
        {
          connection_id: '00000000-0000-4000-8000-000000000001',
          status: 'active',
          peer_origin: 'https://gym.example',
          peer_owner_ref: 'owner',
          scopes: ['workout'],
          include_history: false,
          affected_record_counts: {},
          capabilities: null,
        },
      ],
    });
    await expect(getSparkyGymStatus()).rejects.toThrow();
  });
  beforeEach(() => jest.clearAllMocks());
  it('reads only the authenticated owner status', async () => {
    jest.mocked(apiCall).mockResolvedValue({ connections: [] });
    expect(await getSparkyGymStatus()).toEqual({ connections: [] });
    expect(apiCall).toHaveBeenCalledWith('/integrations/sparkygym');
  });
  it('does not send invalid invitation requests', async () => {
    await expect(
      createSparkyGymInvitation({
        ...request,
        peer_origin: 'https://gym.example/path',
      })
    ).rejects.toThrow();
    expect(apiCall).not.toHaveBeenCalled();
  });
  it('rejects unconfirmed purge before sending', async () => {
    await expect(
      controlSparkyGym('00000000-0000-4000-8000-000000000001', 'purge', {})
    ).rejects.toThrow();
    expect(apiCall).not.toHaveBeenCalled();
  });
});
