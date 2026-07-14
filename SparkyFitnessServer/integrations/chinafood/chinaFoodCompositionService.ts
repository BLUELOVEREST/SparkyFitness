import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type RawChinaFoodItem = Record<string, unknown>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text || ['-', '—', 'tr', 'Tr', 'TRACE', 'trace'].includes(text)) {
    return 0;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readFoodItems(): RawChinaFoodItem[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
      const parsed = JSON.parse(content) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is RawChinaFoodItem => !!item)
        : [];
    });
}

function mapChinaFoodItem(item: RawChinaFoodItem) {
  const name = String(item.foodName || '').trim();
  if (!name) return null;
  const externalId = String(item.foodCode || name);
  const defaultVariant = {
    serving_size: 100,
    serving_unit: 'g',
    calories: toNumber(item.energyKCal),
    protein: toNumber(item.protein),
    carbs: toNumber(item.CHO),
    fat: toNumber(item.fat),
    is_default: true,
  };
  const macroRole = inferMacroRole({
    carbs: defaultVariant.carbs,
    protein: defaultVariant.protein,
    fat: defaultVariant.fat,
  });
  return {
    name,
    brand: '中国食物成分表',
    provider_external_id: externalId,
    provider_type: 'china-food-composition',
    macro_role: macroRole,
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

export async function searchChinaFoodCompositionFoods(
  query: string,
  page = 1,
  pageSize = 20
) {
  const normalized = query.trim().toLowerCase();
  const offset = (page - 1) * pageSize;
  const foods = readFoodItems()
    .map(mapChinaFoodItem)
    .filter((food): food is NonNullable<ReturnType<typeof mapChinaFoodItem>> =>
      Boolean(food)
    )
    .filter((food) => food.name.toLowerCase().includes(normalized))
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aScore =
        aName === normalized ? 0 : aName.startsWith(normalized) ? 1 : 2;
      const bScore =
        bName === normalized ? 0 : bName.startsWith(normalized) ? 1 : 2;
      return aScore - bScore || a.name.length - b.name.length;
    });
  const pageItems = foods.slice(offset, offset + pageSize);
  return {
    foods: pageItems,
    pagination: {
      page,
      pageSize,
      totalCount: foods.length,
      hasMore: offset + pageSize < foods.length,
    },
  };
}

export async function getChinaFoodCompositionDetails(externalId: string) {
  const food = readFoodItems()
    .map(mapChinaFoodItem)
    .find((item) => item?.provider_external_id === externalId);
  if (!food) {
    throw Object.assign(new Error('Chinese food composition item not found'), {
      status: 404,
    });
  }
  return food;
}
