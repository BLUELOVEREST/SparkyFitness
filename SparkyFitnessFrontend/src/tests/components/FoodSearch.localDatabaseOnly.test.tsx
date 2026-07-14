import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FoodSearch from '@/components/FoodSearch/FoodSearch';
import { renderWithClient } from '../test-utils';

const mockUseDatabaseFoodSearchQuery = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    defaultFoodDataProviderId: null,
    defaultBarcodeProviderId: null,
    itemDisplayLimit: 20,
    foodDisplayLimit: 20,
    nutrientDisplayPreferences: [],
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: (unit: 'kcal' | 'kJ') => unit,
    autoScaleOpenFoodFactsImports: false,
  }),
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('@/hooks/Foods/useFoods', () => ({
  useRecentAndTopFoodsQuery: () => ({
    data: { recentFoods: [], topFoods: [] },
    isFetching: false,
  }),
  useDatabaseFoodSearchQuery: (
    term: string,
    limit: number,
    mealType: string | undefined,
    enabled: boolean
  ) => mockUseDatabaseFoodSearchQuery(term, limit, mealType, enabled),
  useImportCsvMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));

jest.mock('@/hooks/Foods/useMeals', () => ({
  mealSearchOptions: () => ({
    queryKey: ['meals', 'search'],
    queryFn: jest.fn(),
  }),
}));

jest.mock('@/hooks/Foods/useNutrionix', () => ({
  nutritionixBrandedNutrientsOptions: jest.fn(),
  nutritionixNaturalNutrientsOptions: jest.fn(),
  searchNutritionixOptions: jest.fn(),
}));

jest.mock('@/hooks/Foods/useFoodsV2', () => ({
  foodDetailsV2Options: jest.fn(),
  searchBarcodeV2Options: jest.fn(),
  searchFoodsV2Options: jest.fn(),
}));

jest.mock('@/hooks/Settings/useExternalProviderSettings', () => ({
  useExternalProvidersQuery: () => ({ data: [] }),
}));

jest.mock('@/hooks/Foods/useAllProvidersFoodSearch', () => ({
  useAllProvidersFoodSearch: () => ({
    providerResults: [],
    anyLoading: false,
    isSearchActive: false,
    submittedSearch: '',
  }),
}));

jest.mock('@/components/FoodSearch/FoodResultCard', () => {
  return function MockFoodResultCard({
    item,
    onCardClick,
  }: {
    item: { name: string };
    onCardClick: () => void;
  }) {
    return (
      <button type="button" onClick={onCardClick}>
        {item.name}
      </button>
    );
  };
});

jest.mock('@/components/FoodSearch/BarcodeScannerDialog', () => ({
  BarcodeScannerDialog: () => null,
}));

jest.mock('@/components/FoodSearch/CsvImportDialog', () => ({
  CsvImportDialog: () => null,
}));

jest.mock('@/components/FoodSearch/FoodFormDialog', () => ({
  FoodFormDialog: () => null,
}));

describe('FoodSearch local database only mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabaseFoodSearchQuery.mockReturnValue({
      data: {
        searchResults: [
          { id: 'rice', name: 'Rice', is_custom: true, macro_role: 'carb' },
          {
            id: 'chicken',
            name: 'Chicken Breast',
            is_custom: true,
            macro_role: 'protein',
          },
        ],
      },
      isFetching: false,
    });
  });

  it('browses local foods on empty search and filters by macro role', () => {
    renderWithClient(
      <FoodSearch
        onFoodSelect={jest.fn()}
        localDatabaseOnly
        hideMealTab
        macroRoleFilter="carb"
      />
    );

    expect(mockUseDatabaseFoodSearchQuery).toHaveBeenCalledWith(
      '',
      20,
      undefined,
      true
    );
    expect(screen.getByText('Rice')).toBeInTheDocument();
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
  });
});
