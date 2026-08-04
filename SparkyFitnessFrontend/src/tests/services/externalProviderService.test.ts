import { createExternalProvider } from '@/api/Settings/externalProviderService';
import { apiCall } from '@/api/api';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

const mockApiCall = jest.mocked(apiCall);

describe('externalProviderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves Grocy base URL when creating an external provider', async () => {
    mockApiCall.mockResolvedValue({
      id: 'provider-1',
      provider_type: 'grocy',
      is_active: true,
    });

    await createExternalProvider({
      user_id: 'user-1',
      provider_name: 'Grocy',
      provider_type: 'grocy',
      app_key: 'grocy-api-key',
      base_url: 'https://grocy.blueloverest.site:44443',
      is_active: true,
    });

    expect(mockApiCall).toHaveBeenCalledWith(
      '/external-providers',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          user_id: 'user-1',
          provider_name: 'Grocy',
          provider_type: 'grocy',
          app_id: null,
          app_key: 'grocy-api-key',
          is_active: true,
          base_url: 'https://grocy.blueloverest.site:44443',
          sync_frequency: null,
        }),
      })
    );
  });
});
