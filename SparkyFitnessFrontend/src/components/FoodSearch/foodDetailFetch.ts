import type { Food } from '@/types/food';

const DETAIL_FETCH_PROVIDER_TYPES = new Set([
  'fatsecret',
  'usda',
  'yazio',
  'swissfood',
]);

export function isGrocyExternalCandidate(
  food: Pick<Food, 'provider_type' | 'provider_external_id'>
) {
  return (
    food.provider_type === 'grocy' &&
    typeof food.provider_external_id === 'string' &&
    food.provider_external_id.includes(':')
  );
}

export function shouldFetchFoodDetailsBeforeEdit(
  food: Pick<Food, 'provider_type' | 'provider_external_id'>
) {
  if (!food.provider_external_id) {
    return false;
  }

  return (
    DETAIL_FETCH_PROVIDER_TYPES.has(food.provider_type ?? '') ||
    isGrocyExternalCandidate(food)
  );
}
