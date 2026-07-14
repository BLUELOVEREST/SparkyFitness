import {
  inferMacroRole,
  recommendCarbCycleMealAmounts,
} from '@/utils/carbCycleFoodRoles';

describe('carbCycleFoodRoles', () => {
  it('infers the dominant macro role only when one macro clearly dominates', () => {
    expect(inferMacroRole({ carbs: 28, protein: 3, fat: 0.3 })).toBe('carb');
    expect(inferMacroRole({ carbs: 0, protein: 24, fat: 2 })).toBe('protein');
    expect(inferMacroRole({ carbs: 0, protein: 0, fat: 100 })).toBe('fat');
    expect(inferMacroRole({ carbs: 1, protein: 13, fat: 10 })).toBeNull();
  });

  it('recommends low-carb amounts by protein then fat then carbs', () => {
    const result = recommendCarbCycleMealAmounts({
      dayType: 'low',
      target: { carbs: 20, protein: 40, fat: 25 },
      foods: {
        protein: {
          servingSize: 100,
          carbs: 0,
          protein: 20,
          fat: 2,
        },
        fat: {
          servingSize: 10,
          carbs: 0,
          protein: 0,
          fat: 10,
        },
        carb: {
          servingSize: 100,
          carbs: 25,
          protein: 2,
          fat: 0,
        },
      },
    });

    expect(result.amounts.protein).toBe(200);
    expect(result.amounts.fat).toBe(21);
    expect(result.amounts.carb).toBe(80);
    expect(result.actual.protein).toBeCloseTo(41.6);
    expect(result.actual.fat).toBeCloseTo(25);
    expect(result.actual.carbs).toBeCloseTo(20);
  });

  it('recommends medium and high-carb amounts by protein then carbs then fat', () => {
    const result = recommendCarbCycleMealAmounts({
      dayType: 'high',
      target: { carbs: 80, protein: 40, fat: 15 },
      foods: {
        protein: {
          servingSize: 100,
          carbs: 0,
          protein: 20,
          fat: 2,
        },
        carb: {
          servingSize: 100,
          carbs: 25,
          protein: 2,
          fat: 0,
        },
        fat: {
          servingSize: 10,
          carbs: 0,
          protein: 0,
          fat: 10,
        },
      },
    });

    expect(result.amounts.protein).toBe(200);
    expect(result.amounts.carb).toBe(320);
    expect(result.amounts.fat).toBe(11);
    expect(result.actual.carbs).toBeCloseTo(80);
    expect(result.actual.protein).toBeCloseTo(46.4);
    expect(result.actual.fat).toBeCloseTo(15);
  });
});
