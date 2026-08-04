import { splitFoodSearchProviders } from '@/hooks/Foods/useAllProvidersFoodSearch';
import type { DataProvider } from '@/types/settings';

const provider = (providerType: string): DataProvider => ({
  id: providerType,
  name: providerType,
  provider_type: providerType,
  provider_name: providerType,
  is_active: true,
  app_key: '',
});

describe('splitFoodSearchProviders', () => {
  it('keeps grocy primary and disables direct boohee fallback when grocy is active', () => {
    const grocy = provider('grocy');
    const boohee = provider('boohee');

    const { primaryProviders, fallbackProviders } = splitFoodSearchProviders([
      grocy,
      boohee,
    ]);

    expect(primaryProviders).toContain(grocy);
    expect(fallbackProviders).toEqual([]);
  });

  it('preserves direct boohee fallback when no grocy provider is active', () => {
    const boohee = provider('boohee');

    const { primaryProviders, fallbackProviders } = splitFoodSearchProviders([
      boohee,
    ]);

    expect(primaryProviders).toEqual([]);
    expect(fallbackProviders).toEqual([boohee]);
  });

  it('keeps non-limited providers primary and boohee fallback when grocy is absent', () => {
    const openFoodFacts = provider('openfoodfacts');
    const boohee = provider('boohee');

    const { primaryProviders, fallbackProviders } = splitFoodSearchProviders([
      openFoodFacts,
      boohee,
    ]);

    expect(primaryProviders).toEqual([openFoodFacts]);
    expect(fallbackProviders).toEqual([boohee]);
  });
});
