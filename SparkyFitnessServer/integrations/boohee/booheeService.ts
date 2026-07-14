const BOOHEE_BASE_URL = 'https://api.boohee.com';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function firstString(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function firstNumber(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const parsed = toNumber(raw[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function extractFoods(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === 'object') {
    const foods = (data as Record<string, unknown>).foods;
    if (Array.isArray(foods)) {
      return foods.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item)
      );
    }
  }
  return [];
}

function mapBooheeFood(raw: Record<string, unknown>) {
  const name = firstString(raw, ['name', 'food_name', 'title']);
  const calories = firstNumber(raw, ['calories', 'calory', 'energy']);
  const protein = firstNumber(raw, ['protein']);
  const fat = firstNumber(raw, ['fat']);
  const carbs = firstNumber(raw, ['carbohydrate', 'carbs']);
  if (
    !name ||
    calories === null ||
    protein === null ||
    fat === null ||
    carbs === null
  ) {
    return null;
  }
  const externalId = firstString(raw, ['code', 'id', 'uuid']) || name;
  const defaultVariant = {
    serving_size: 100,
    serving_unit: 'g',
    calories,
    protein,
    carbs,
    fat,
    is_default: true,
  };
  return {
    name,
    brand: '薄荷',
    provider_external_id: externalId,
    provider_type: 'boohee',
    macro_role: inferMacroRole({ carbs, protein, fat }),
    is_custom: false,
    default_variant: defaultVariant,
    variants: [defaultVariant],
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
    return top[0];
  }
  return null;
}

async function getJson(
  path: string,
  appKey: string | undefined,
  params: Record<string, string>
) {
  if (!appKey) {
    throw Object.assign(new Error('Boohee API key is required'), {
      status: 400,
    });
  }
  const url = new URL(`${BOOHEE_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${appKey}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Boohee API returned ${response.status}: ${body}`);
  }
  return response.json() as Promise<unknown>;
}

export async function searchBooheeFoods(
  query: string,
  appKey: string | undefined,
  page = 1,
  pageSize = 20
) {
  const payload = await getJson('/open-apis/v1/food/search', appKey, {
    keyword: query,
    page: String(page),
    per_page: String(pageSize),
  });
  const foods = extractFoods(payload).map(mapBooheeFood).filter(Boolean);
  const data =
    payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).data as
          | Record<string, unknown>
          | undefined)
      : undefined;
  return {
    foods,
    pagination: {
      page,
      pageSize,
      totalCount: foods.length,
      hasMore: Boolean(data?.has_more),
    },
  };
}

export async function getBooheeFoodDetails(
  externalId: string,
  appKey: string | undefined
) {
  const payload = await getJson('/open-apis/v1/food/detail', appKey, {
    code: externalId,
  });
  const data =
    payload && typeof payload === 'object'
      ? ((payload as Record<string, unknown>).data as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const food = mapBooheeFood(data || {});
  if (!food) {
    throw Object.assign(new Error('Boohee food detail is missing nutrients'), {
      status: 502,
    });
  }
  return food;
}
