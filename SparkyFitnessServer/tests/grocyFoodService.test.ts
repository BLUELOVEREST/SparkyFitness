import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGrocyFoodDetails,
  importGrocyFoodFromSource,
  mapGrocyFood,
  searchGrocyFoods,
} from '../integrations/grocy/grocyFoodService.js';

const originalFetch = global.fetch;

const makeResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

const grocyFood = {
  id: 42,
  name: '番茄',
  aliases: ['西红柿', 'tomato'],
  matched_alias: '西红柿',
  source: {
    provider: 'china-food-composition',
  },
  stock_unit: {
    id: 2,
    name: 'piece',
    name_plural: 'pieces',
  },
  nutrition: {
    basis_amount: 100,
    basis_qu_id: 1,
    basis_unit: {
      id: 1,
      name: 'g',
      name_plural: 'g',
    },
    calories: 143,
    protein: 12.6,
    fat: 9.5,
    carbohydrates: 1.1,
  },
  unit_conversions: [
    {
      from_qu_id: 2,
      from_unit: {
        id: 2,
        name: 'piece',
        name_plural: 'pieces',
      },
      to_qu_id: 1,
      to_unit: {
        id: 1,
        name: 'g',
        name_plural: 'g',
      },
      factor: 50,
    },
  ],
};

const booheeExternalFood = {
  id: null,
  imported: false,
  name: 'Chicken Breast',
  source: {
    type: 'boohee',
    provider: 'boohee',
    external_id: 'boohee-chicken',
  },
  nutrition: {
    basis_amount: 100,
    basis_qu_id: null,
    basis_unit: {
      id: null,
      name: 'g',
      name_plural: 'g',
    },
    calories: 165,
    protein: 31,
    fat: 3.6,
    carbohydrates: 0,
  },
};

describe('grocyFoodService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps Grocy foods into Sparky normalized food shape with unit variants', () => {
    const result = mapGrocyFood(grocyFood);

    expect(result).toMatchObject({
      name: '番茄',
      brand: 'china-food-composition',
      provider_external_id: '42',
      provider_type: 'grocy',
      provider_verified: true,
      is_custom: false,
      default_variant: {
        serving_size: 100,
        serving_unit: 'g',
        calories: 143,
        protein: 12.6,
        carbs: 1.1,
        fat: 9.5,
        is_default: true,
      },
    });
    expect(result?.variants).toContainEqual(
      expect.objectContaining({
        serving_size: 1,
        serving_unit: 'piece',
        calories: 71.5,
        protein: 6.3,
        carbs: 0.55,
        fat: 4.75,
        is_default: false,
      })
    );
    expect(result).not.toHaveProperty('aliases');
    expect(result).not.toHaveProperty('matched_alias');
  });

  it('does not map incomplete Grocy nutrition as zero nutrition', () => {
    expect(
      mapGrocyFood({
        ...grocyFood,
        nutrition: {
          ...grocyFood.nutrition,
          protein: null,
        },
      })
    ).toBeNull();
  });

  it('searches Grocy foods with Grocy API auth and pagination mapping', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      makeResponse({
        foods: [grocyFood],
        pagination: {
          page: 2,
          pageSize: 10,
          totalCount: 15,
          hasMore: true,
        },
      })
    );

    const result = await searchGrocyFoods(
      'egg',
      'https://grocy.example.test/',
      'secret',
      2,
      10
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://grocy.example.test/api/eric/foods/search?query=egg&page=2&page_size=10',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'GROCY-API-KEY': 'secret',
        },
      })
    );
    expect(result.foods).toHaveLength(1);
    expect(result.foods[0].provider_external_id).toBe('42');
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      totalCount: 15,
      hasMore: true,
    });
  });

  it('can force Grocy external provider fallback when requested', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      makeResponse({
        foods: [booheeExternalFood],
        pagination: {
          page: 1,
          pageSize: 20,
          totalCount: 1,
          hasMore: false,
        },
      })
    );

    const result = await searchGrocyFoods(
      'caramel',
      'https://grocy.example.test',
      'secret',
      1,
      20,
      true
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://grocy.example.test/api/eric/foods/search?query=caramel&page=1&page_size=20&include_external=1',
      expect.objectContaining({
        method: 'GET',
      })
    );
    expect(result.foods[0]?.provider_external_id).toBe('boohee:boohee-chicken');
  });

  it('maps Grocy-returned Boohee external candidates as selectable foods', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      makeResponse({
        foods: [booheeExternalFood],
        pagination: {
          page: 1,
          pageSize: 20,
          totalCount: 1,
          hasMore: false,
        },
      })
    );

    const result = await searchGrocyFoods(
      'chicken',
      'https://grocy.example.test',
      'secret'
    );

    expect(result.foods[0]).toMatchObject({
      name: 'Chicken Breast',
      provider_type: 'grocy',
      provider_external_id: 'boohee:boohee-chicken',
      provider_verified: true,
    });
  });

  it('imports a Grocy-returned external food candidate through Grocy', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(makeResponse({ id: 42 }));

    await importGrocyFoodFromSource(
      'boohee',
      'boohee-chicken',
      'https://grocy.example.test',
      'secret'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://grocy.example.test/api/eric/foods/import-from-source',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          provider: 'boohee',
          external_id: 'boohee-chicken',
        }),
      })
    );
  });

  it('fetches Grocy food details by product id', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(makeResponse(grocyFood));

    const result = await getGrocyFoodDetails(
      '42',
      'https://grocy.example.test',
      'secret'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://grocy.example.test/api/eric/foods/42',
      expect.any(Object)
    );
    expect(result.name).toBe('番茄');
    expect(result.provider_external_id).toBe('42');
  });

  it('requires configured Grocy credentials', async () => {
    await expect(
      searchGrocyFoods('egg', undefined, 'secret')
    ).rejects.toMatchObject({
      message: 'Grocy base URL is required',
      status: 400,
    });
    await expect(
      searchGrocyFoods('egg', 'https://grocy.example.test', undefined)
    ).rejects.toMatchObject({
      message: 'Grocy API key is required',
      status: 400,
    });
  });
});
