import type { NormalizedFood } from '../../schemas/foodSchemas.js';

type GrocyUnit = {
  id: number | null;
  name: string | null;
  name_plural?: string | null;
};

type GrocyNutrition = {
  basis_amount: number | null;
  basis_qu_id: number | null;
  basis_unit?: GrocyUnit | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
};

type GrocyConversion = {
  from_qu_id: number;
  from_unit?: GrocyUnit | null;
  to_qu_id: number;
  to_unit?: GrocyUnit | null;
  factor: number;
};

type GrocyFood = {
  id: number;
  name: string;
  aliases?: string[];
  matched_alias?: string | null;
  stock_unit?: GrocyUnit | null;
  nutrition?: GrocyNutrition | null;
  source?: {
    provider?: string | null;
  } | null;
  unit_conversions?: GrocyConversion[];
};

type ImportableFood = Pick<
  NormalizedFood,
  | 'name'
  | 'brand'
  | 'provider_external_id'
  | 'provider_type'
  | 'default_variant'
>;

function requireConfig(
  baseUrl: string | undefined,
  appKey: string | undefined
) {
  if (!baseUrl) {
    throw Object.assign(new Error('Grocy base URL is required'), {
      status: 400,
    });
  }
  if (!appKey) {
    throw Object.assign(new Error('Grocy API key is required'), {
      status: 400,
    });
  }

  return { baseUrl, appKey };
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

async function getGrocyJson(
  baseUrl: string | undefined,
  appKey: string | undefined,
  path: string,
  params: Record<string, string> = {}
) {
  const config = requireConfig(baseUrl, appKey);

  const url = new URL(`${normalizeBaseUrl(config.baseUrl)}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'GROCY-API-KEY': config.appKey,
    },
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`Grocy API returned status ${response.status}`),
      {
        status: response.status >= 400 && response.status < 500 ? 400 : 502,
      }
    );
  }

  return response.json() as Promise<unknown>;
}

async function postGrocyJson(
  baseUrl: string | undefined,
  appKey: string | undefined,
  path: string,
  body: unknown
) {
  const config = requireConfig(baseUrl, appKey);
  const url = new URL(`${normalizeBaseUrl(config.baseUrl)}${path}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'GROCY-API-KEY': config.appKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`Grocy API returned status ${response.status}`),
      {
        status: response.status >= 400 && response.status < 500 ? 400 : 502,
      }
    );
  }

  return response.json() as Promise<unknown>;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasCompleteNutrition(nutrition: GrocyNutrition) {
  return (
    numberOrZero(nutrition.basis_amount) > 0 &&
    nutrition.basis_qu_id !== null &&
    nutrition.calories !== null &&
    nutrition.protein !== null &&
    nutrition.fat !== null &&
    nutrition.carbohydrates !== null
  );
}

function unitName(
  unit: GrocyUnit | null | undefined,
  fallback: string | null = 'g'
) {
  return unit?.name || unit?.name_plural || fallback;
}

function scaleVariant(
  nutrition: GrocyNutrition,
  servingSize: number,
  servingUnit: string,
  factor: number,
  isDefault: boolean
) {
  return {
    serving_size: servingSize,
    serving_unit: servingUnit,
    serving_description: `${servingSize} ${servingUnit}`,
    calories: numberOrZero(nutrition.calories) * factor,
    protein: numberOrZero(nutrition.protein) * factor,
    carbs: numberOrZero(nutrition.carbohydrates) * factor,
    fat: numberOrZero(nutrition.fat) * factor,
    is_default: isDefault,
    source: 'imported' as const,
  };
}

function buildVariants(food: GrocyFood, nutrition: GrocyNutrition) {
  const basisAmount = numberOrZero(nutrition.basis_amount) || 100;
  const basisUnitId = nutrition.basis_qu_id;
  const basisUnit = unitName(nutrition.basis_unit) || 'g';
  const variants = [scaleVariant(nutrition, basisAmount, basisUnit, 1, true)];
  const seen = new Set([`${basisAmount}:${basisUnit}`]);

  for (const conversion of food.unit_conversions || []) {
    if (!basisUnitId || !Number.isFinite(Number(conversion.factor))) {
      continue;
    }

    let convertedBasisAmount: number | null = null;
    let servingUnit: string | null = null;

    if (conversion.to_qu_id === basisUnitId) {
      convertedBasisAmount = Number(conversion.factor);
      servingUnit = unitName(conversion.from_unit, null);
    } else if (
      conversion.from_qu_id === basisUnitId &&
      Number(conversion.factor) !== 0
    ) {
      convertedBasisAmount = 1 / Number(conversion.factor);
      servingUnit = unitName(conversion.to_unit, null);
    }

    if (!servingUnit || !convertedBasisAmount || convertedBasisAmount <= 0) {
      continue;
    }

    const key = `1:${servingUnit}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    variants.push(
      scaleVariant(
        nutrition,
        1,
        servingUnit,
        convertedBasisAmount / basisAmount,
        false
      )
    );
  }

  return variants;
}

export function mapGrocyFood(food: GrocyFood): NormalizedFood | null {
  if (
    !food?.id ||
    !food.name ||
    !food.nutrition ||
    !hasCompleteNutrition(food.nutrition)
  ) {
    return null;
  }

  const variants = buildVariants(food, food.nutrition);
  const defaultVariant = variants[0];
  if (!defaultVariant) {
    return null;
  }

  return {
    name: food.name,
    brand: food.source?.provider || 'Grocy',
    provider_external_id: String(food.id),
    provider_type: 'grocy',
    provider_verified: true,
    macro_role: inferMacroRole({
      carbs: defaultVariant.carbs,
      protein: defaultVariant.protein,
      fat: defaultVariant.fat,
    }),
    is_custom: false,
    default_variant: defaultVariant,
    variants,
  };
}

function inferMacroRole(macros: {
  carbs: number;
  protein: number;
  fat: number;
}) {
  const sorted = [
    ['carb', macros.carbs],
    ['protein', macros.protein],
    ['fat', macros.fat],
  ].sort((a, b) => Number(b[1]) - Number(a[1]));
  const top = sorted[0];
  const second = sorted[1];
  if (!top || Number(top[1]) <= 0) return null;
  if (
    !second ||
    Number(second[1]) === 0 ||
    Number(top[1]) > Number(second[1]) * 1.3
  ) {
    return top[0] as 'carb' | 'protein' | 'fat';
  }
  return null;
}

export async function searchGrocyFoods(
  query: string,
  baseUrl: string | undefined,
  appKey: string | undefined,
  page = 1,
  pageSize = 20
) {
  const payload = await getGrocyJson(
    baseUrl,
    appKey,
    '/api/eric/foods/search',
    {
      query,
      page: String(page),
      page_size: String(pageSize),
    }
  );
  const record =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const foods = Array.isArray(record.foods)
    ? record.foods
        .map((item) => mapGrocyFood(item as GrocyFood))
        .filter((item): item is NormalizedFood => Boolean(item))
    : [];
  const pagination =
    record.pagination && typeof record.pagination === 'object'
      ? (record.pagination as Record<string, unknown>)
      : {};

  return {
    foods,
    pagination: {
      page: Number(pagination.page) || page,
      pageSize: Number(pagination.pageSize) || pageSize,
      totalCount: Number(pagination.totalCount) || foods.length,
      hasMore: Boolean(pagination.hasMore),
    },
  };
}

export async function getGrocyFoodDetails(
  externalId: string,
  baseUrl: string | undefined,
  appKey: string | undefined
) {
  const payload = await getGrocyJson(
    baseUrl,
    appKey,
    `/api/eric/foods/${encodeURIComponent(externalId)}`
  );
  const food = mapGrocyFood(payload as GrocyFood);
  if (!food) {
    throw Object.assign(new Error('Grocy food is missing nutrition'), {
      status: 502,
    });
  }
  return food;
}

export async function importFoodToGrocy(
  food: ImportableFood,
  baseUrl: string | undefined,
  appKey: string | undefined
) {
  const variant = food.default_variant;
  if (!food.provider_type || !food.provider_external_id) {
    throw Object.assign(new Error('Food provider identity is required'), {
      status: 400,
    });
  }

  return postGrocyJson(baseUrl, appKey, '/api/eric/foods/import', {
    provider: food.provider_type,
    external_id: food.provider_external_id,
    name: food.name,
    brand: food.brand,
    stock_unit: variant.serving_unit,
    basis_amount: variant.serving_size,
    basis_unit: variant.serving_unit,
    calories: variant.calories,
    protein: variant.protein,
    fat: variant.fat,
    carbohydrates: variant.carbs,
  });
}
