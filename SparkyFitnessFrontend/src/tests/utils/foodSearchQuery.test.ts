import {
  getFoodProviderSearchMinLength,
  isFoodProviderSearchActive,
} from '../../utils/foodSearchQuery';

describe('foodSearchQuery', () => {
  it('allows short CJK food names', () => {
    expect(getFoodProviderSearchMinLength('鸡')).toBe(1);
    expect(isFoodProviderSearchActive('鸡')).toBe(true);
    expect(isFoodProviderSearchActive('鸡蛋')).toBe(true);
  });

  it('keeps the longer Latin query threshold', () => {
    expect(getFoodProviderSearchMinLength('egg')).toBe(3);
    expect(isFoodProviderSearchActive('eg')).toBe(false);
    expect(isFoodProviderSearchActive('egg')).toBe(true);
  });

  it('requires both live and debounced terms to pass the threshold', () => {
    expect(isFoodProviderSearchActive('鸡蛋', '')).toBe(false);
    expect(isFoodProviderSearchActive('chicken', 'ch')).toBe(false);
  });
});
