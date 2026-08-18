import { renderHook } from '@testing-library/react';
import { useMeasurementChartWidgets } from '@/pages/Reports/MeasurementChartsGrid';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    formatDateInUserTimezone: () => 'May 15',
    weightUnit: 'lbs',
    measurementUnit: 'in',
    convertWeight: (value: number) => value,
    convertMeasurement: (value: number) => value,
  }),
}));

describe('useMeasurementChartWidgets', () => {
  it('registers extra built-in circumference widgets', () => {
    const { result } = renderHook(() =>
      useMeasurementChartWidgets({
        measurementData: [
          {
            id: 'measurement-1',
            user_id: 'user-1',
            updated_at: '2026-05-15T00:00:00.000Z',
            created_by_user_id: null,
            updated_by_user_id: null,
            entry_date: '2026-05-15',
            weight: null,
            neck: null,
            waist: null,
            hips: null,
            steps: null,
            height: null,
            body_fat_percentage: null,
            shoulders: 112,
            chest: 101,
            abdomen: 88,
            left_biceps: 34,
            right_biceps: 35,
            left_thigh: 58,
            right_thigh: 59,
            left_calf: 38,
            right_calf: 39,
            muscle_mass_kg: null,
            bone_mass_kg: null,
            body_water_percentage: null,
          },
        ],
      })
    );

    expect(result.current.map((widget) => widget.key)).toEqual(
      expect.arrayContaining(['shoulders', 'chest', 'left_calf', 'right_calf'])
    );
  });
});
