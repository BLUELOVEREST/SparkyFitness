import type { Food } from '@/types/food';
import { foodProviderNeedsDetailFetch } from '@workspace/shared';

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
    foodProviderNeedsDetailFetch(food.provider_type) ||
    isGrocyExternalCandidate(food)
  );
}
