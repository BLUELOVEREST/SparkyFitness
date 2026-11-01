import { apiFetch } from '../../../src/services/api/apiClient';
import {
  getSparkyGymStatus,
  createSparkyGymInvitation,
} from '../../../src/services/api/sparkyGymApi';
jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));
describe('SparkyGym owner API', () => {
  it('rejects missing delivery diagnostics instead of manufacturing healthy counts', async () => {
    jest.mocked(apiFetch).mockResolvedValue({
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
  it('reads owner status without a delegated user ID', async () => {
    jest.mocked(apiFetch).mockResolvedValue({ connections: [] });
    expect(await getSparkyGymStatus()).toEqual({ connections: [] });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/api/integrations/sparkygym' })
    );
  });
  it('validates invitation origin before sending', async () => {
    jest.clearAllMocks();
    await expect(
      createSparkyGymInvitation({
        peer_origin: 'file:///tmp',
        self_origin: 'http://192.168.200.118:3006',
      })
    ).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
