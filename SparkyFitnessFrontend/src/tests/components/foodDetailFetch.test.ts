import {
  isGrocyExternalCandidate,
  shouldFetchFoodDetailsBeforeEdit,
} from '@/components/FoodSearch/foodDetailFetch';

describe('foodDetailFetch', () => {
  it('fetches details for Grocy-returned external candidates', () => {
    const food = {
      provider_type: 'grocy',
      provider_external_id: 'boohee:foo:bar',
    } as const;

    expect(isGrocyExternalCandidate(food)).toBe(true);
    expect(shouldFetchFoodDetailsBeforeEdit(food)).toBe(true);
  });

  it('does not fetch details for local Grocy foods', () => {
    expect(
      shouldFetchFoodDetailsBeforeEdit({
        provider_type: 'grocy',
        provider_external_id: '42',
      })
    ).toBe(false);
  });

  it('keeps existing provider detail fetch behavior', () => {
    expect(
      shouldFetchFoodDetailsBeforeEdit({
        provider_type: 'usda',
        provider_external_id: '123',
      })
    ).toBe(true);
    expect(
      shouldFetchFoodDetailsBeforeEdit({
        provider_type: 'openfoodfacts',
        provider_external_id: '123',
      })
    ).toBe(false);
  });
});
