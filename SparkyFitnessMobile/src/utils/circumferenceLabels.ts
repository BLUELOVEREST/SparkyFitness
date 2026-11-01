import type { TFunction } from 'i18next';
import type { ExtraBodyCircumferencePart } from '@workspace/shared';

export function circumferenceLabel(
  key: ExtraBodyCircumferencePart,
  t: TFunction
): string {
  switch (key) {
    case 'shoulders':
      return t('measurements.fields.shoulders', { defaultValue: 'Shoulders' });
    case 'chest':
      return t('measurements.fields.chest', { defaultValue: 'Chest' });
    case 'abdomen':
      return t('measurements.fields.abdomen', { defaultValue: 'Abdomen' });
    case 'left_biceps':
      return t('measurements.fields.left_biceps', {
        defaultValue: 'Left Biceps',
      });
    case 'right_biceps':
      return t('measurements.fields.right_biceps', {
        defaultValue: 'Right Biceps',
      });
    case 'left_thigh':
      return t('measurements.fields.left_thigh', {
        defaultValue: 'Left Thigh',
      });
    case 'right_thigh':
      return t('measurements.fields.right_thigh', {
        defaultValue: 'Right Thigh',
      });
    case 'left_calf':
      return t('measurements.fields.left_calf', { defaultValue: 'Left Calf' });
    case 'right_calf':
      return t('measurements.fields.right_calf', {
        defaultValue: 'Right Calf',
      });
    case 'left_forearm':
      return t('measurements.fields.left_forearm', {
        defaultValue: 'Left Forearm',
      });
    case 'right_forearm':
      return t('measurements.fields.right_forearm', {
        defaultValue: 'Right Forearm',
      });
    case 'left_wrist':
      return t('measurements.fields.left_wrist', {
        defaultValue: 'Left Wrist',
      });
    case 'right_wrist':
      return t('measurements.fields.right_wrist', {
        defaultValue: 'Right Wrist',
      });
    case 'left_ankle':
      return t('measurements.fields.left_ankle', {
        defaultValue: 'Left Ankle',
      });
    case 'right_ankle':
      return t('measurements.fields.right_ankle', {
        defaultValue: 'Right Ankle',
      });
  }
}
