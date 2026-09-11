import { fetchDailyGoals, previewCarbCycleWeek } from '../../src/services/api/goalsApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage')
    .proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('goalsApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchDailyGoals', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    const testDate = '2024-06-15';

    test('throws error when no server config exists', async () => {
      mockGetActiveServerConfig.mockResolvedValue(null);

      await expect(fetchDailyGoals(testDate)).rejects.toThrow(
        'Server configuration not found.'
      );
    });

    test('sends GET request to /api/goals/for-date with correct date param', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ calories: 2000, protein: 150 }),
      });

      await fetchDailyGoals(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/goals/for-date?date=2024-06-15',
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer test-api-key-12345',

            'X-Meal-Model-Version': '2',
          },
        })
      );
    });

    test('removes trailing slash from URL before making request', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        ...testConfig,
        url: 'https://example.com/',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ calories: 2000 }),
      });

      await fetchDailyGoals(testDate);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/goals/for-date?date=2024-06-15',
        expect.anything()
      );
    });

    test('returns parsed JSON response on success', async () => {
      const responseData = {
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 60,
        dietary_fiber: 30,
      };
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await fetchDailyGoals(testDate);

      expect(result).toEqual(responseData);
    });

    test('throws error on non-OK response', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(fetchDailyGoals(testDate)).rejects.toThrow(
        'Server error: 500 - Internal Server Error'
      );
    });

    test('rethrows on network failure', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockRejectedValue(new Error('Network request failed'));

      await expect(fetchDailyGoals(testDate)).rejects.toThrow(
        'Network request failed'
      );
    });
  });

  describe('previewCarbCycleWeek', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key-12345',
    };

    test('posts carb cycle input to the preview endpoint', async () => {
      const payload = {
        weekStartDate: '2026-07-13',
        bodyWeightKg: 80,
        carbsPerKg: 2,
        proteinPerKg: 1.5,
        fatPerKg: 0.8,
      };
      const responseData = {
        weekStartDate: '2026-07-13',
        weekTotals: { calories: 1000, carbs: 100, protein: 100, fat: 50 },
        days: [],
      };

      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      });

      const result = await previewCarbCycleWeek(payload);

      expect(result).toEqual(responseData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/weekly-goal-plans/carb-cycle/preview',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key-12345',

            'X-Meal-Model-Version': '2',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
      );
    });
  });
});
