import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/externalFoodSearchService.js', () => ({
  isValidProviderType: vi.fn((value: string) => value === 'grocy'),
  resolveOpenFoodFactsProviderId: vi.fn(),
  resolveProviderCredentials: vi.fn().mockResolvedValue({
    base_url: 'http://grocy.test',
    app_key: 'test-key',
  }),
}));

vi.mock('../integrations/grocy/grocyFoodService.js', () => ({
  getGrocyFoodDetails: vi.fn(),
  importGrocyFoodFromSource: vi.fn(),
}));

import {
  getGrocyFoodDetails,
  importGrocyFoodFromSource,
} from '../integrations/grocy/grocyFoodService.js';
import { fetchProviderFoodDetails } from '../services/foodProviderDetailService.js';
import type { NormalizedFood } from '../schemas/foodSchemas.js';

const params = {
  credentialUserId: 'user-1',
  dataUserId: 'user-1',
  providerType: 'grocy',
  providerId: 'provider-1',
};

const food: NormalizedFood = {
  name: 'Rice',
  brand: 'Grocy',
  provider_type: 'grocy',
  is_custom: false,
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fat: 0.3,
    is_default: true,
  },
};

describe('Grocy provider detail lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads an existing Grocy product', async () => {
    vi.mocked(getGrocyFoodDetails).mockResolvedValueOnce(food);

    expect(
      await fetchProviderFoodDetails({ ...params, externalId: '42' })
    ).toEqual(food);
    expect(getGrocyFoodDetails).toHaveBeenCalledWith(
      '42',
      'http://grocy.test',
      'test-key'
    );
    expect(importGrocyFoodFromSource).not.toHaveBeenCalled();
  });

  it('imports a Boohee result into Grocy before loading its details', async () => {
    vi.mocked(importGrocyFoodFromSource).mockResolvedValueOnce({ id: 73 });
    vi.mocked(getGrocyFoodDetails).mockResolvedValueOnce({
      ...food,
      name: 'Noodles',
    });

    await fetchProviderFoodDetails({
      ...params,
      externalId: 'boohee:external-42',
    });

    expect(importGrocyFoodFromSource).toHaveBeenCalledWith(
      'boohee',
      'external-42',
      'http://grocy.test',
      'test-key'
    );
    expect(getGrocyFoodDetails).toHaveBeenCalledWith(
      '73',
      'http://grocy.test',
      'test-key'
    );
  });

  it('rejects an unsupported external source', async () => {
    await expect(
      fetchProviderFoodDetails({ ...params, externalId: 'usda:42' })
    ).rejects.toMatchObject({ status: 400 });
    expect(importGrocyFoodFromSource).not.toHaveBeenCalled();
  });
});
