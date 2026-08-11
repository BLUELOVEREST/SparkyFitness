import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ExerciseSearchListItem } from '@/pages/Exercises/ExerciseSearchListItem';
import type { Exercise } from '@/types/exercises';
import { resolveExerciseImageSrc } from '@/utils/exerciseImages';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
  }),
}));

jest.mock('@/utils/nutritionCalculations', () => ({
  getEnergyUnitString: () => 'kcal',
}));

const baseExercise: Exercise = {
  id: 'exercise-1',
  name: 'Bench Press',
  category: 'strength',
  calories_per_hour: 300,
  source: 'wger',
  images: ['Bench_Press/Bench-press-1.png'],
  equipment: ['barbell', 'bench'],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  instructions: ['Press the bar.'],
} as Exercise;

describe('ExerciseSearchListItem image source resolution', () => {
  it('serves imported provider image paths from uploads', () => {
    expect(resolveExerciseImageSrc('Bench_Press/Bench-press-1.png')).toBe(
      '/uploads/exercises/Bench_Press/Bench-press-1.png'
    );
  });

  it('keeps external provider preview URLs unchanged', () => {
    expect(resolveExerciseImageSrc('https://wger.de/media/bench.png')).toBe(
      'https://wger.de/media/bench.png'
    );
  });

  it('renders a local imported wger image through uploads', () => {
    render(
      <ExerciseSearchListItem
        exercise={baseExercise}
        onAction={() => {}}
        actionText="Select"
      />
    );

    expect(screen.getByAltText('Bench Press')).toHaveAttribute(
      'src',
      '/uploads/exercises/Bench_Press/Bench-press-1.png'
    );
  });
});
