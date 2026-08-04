import { getFoodDetailsV2 } from '@/api/Foods/foodService';
import { apiCall } from '@/api/api';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

const mockApiCall = jest.mocked(apiCall);

describe('foodService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('encodes provider external ids in the v2 food details path', async () => {
    mockApiCall.mockResolvedValue({ name: '鸡胸肉' });

    await getFoodDetailsV2('grocy', 'boohee:foo/bar?baz', 'grocy-provider');

    expect(mockApiCall).toHaveBeenCalledWith(
      '/v2/foods/details/grocy/boohee%3Afoo%2Fbar%3Fbaz',
      {
        method: 'GET',
        params: {
          providerId: 'grocy-provider',
        },
      }
    );
  });
});
