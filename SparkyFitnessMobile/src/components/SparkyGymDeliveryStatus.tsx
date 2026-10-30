import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  sparkyGymDeliveryStatusSchema,
  type SparkyGymConnectionStatus,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';

export default function SparkyGymDeliveryStatus({
  delivery,
}: {
  delivery: SparkyGymConnectionStatus['delivery'];
}) {
  const { t, i18n } = useTranslation();
  const code = sparkyGymDeliveryStatusSchema.shape.last_error_code.safeParse(
    delivery.last_error_code
  );
  return (
    <View accessibilityLiveRegion="polite" className="gap-1">
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-text-secondary">
          {t('sparkyGym.deliveryPending', {
            defaultValue: 'Pending: {{value}}',
            value: formatLocalizedNumber(delivery.pending),
          })}
        </Text>
        <Text
          className={
            delivery.failed > 0
              ? 'text-text-primary font-semibold'
              : 'text-text-secondary'
          }
        >
          {t('sparkyGym.deliveryFailed', {
            defaultValue: 'Failed: {{value}}',
            value: formatLocalizedNumber(delivery.failed),
          })}
        </Text>
        <Text className="text-text-secondary">
          {t('sparkyGym.deliveryMedia', {
            defaultValue: 'Pending media: {{value}}',
            value: formatLocalizedNumber(delivery.pending_media),
          })}
        </Text>
      </View>
      <Text className="text-text-secondary">
        {delivery.last_success_at
          ? t('sparkyGym.deliveryLastSuccess', {
              defaultValue: 'Last successful delivery: {{time}}',
              time: new Date(delivery.last_success_at).toLocaleString(
                i18n.language
              ),
            })
          : t('sparkyGym.deliveryNoSuccess', {
              defaultValue: 'No successful delivery yet',
            })}
      </Text>
      {delivery.last_error_code !== null && (
        <Text className="text-text-primary font-semibold">
          {code.success
            ? code.data
            : t('sparkyGym.deliveryError', { defaultValue: 'Delivery error' })}
        </Text>
      )}
    </View>
  );
}
