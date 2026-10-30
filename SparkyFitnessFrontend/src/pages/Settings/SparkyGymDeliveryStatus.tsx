import { useTranslation } from 'react-i18next';
import {
  sparkyGymDeliveryStatusSchema,
  type SparkyGymConnectionStatus,
} from '@workspace/shared';

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
    <div className="space-y-1 text-sm" role="status">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          {t('sparkyGym.deliveryPending', {
            defaultValue: 'Pending: {{value}}',
            value: delivery.pending.toLocaleString(i18n.language),
          })}
        </span>
        <span
          className={
            delivery.failed > 0 ? 'font-semibold text-destructive' : undefined
          }
        >
          {t('sparkyGym.deliveryFailed', {
            defaultValue: 'Failed: {{value}}',
            value: delivery.failed.toLocaleString(i18n.language),
          })}
        </span>
        <span>
          {t('sparkyGym.deliveryMedia', {
            defaultValue: 'Pending media: {{value}}',
            value: delivery.pending_media.toLocaleString(i18n.language),
          })}
        </span>
      </div>
      <p>
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
      </p>
      {delivery.last_error_code !== null && (
        <p className="font-mono break-all text-destructive">
          {code.success
            ? code.data
            : t('sparkyGym.deliveryError', { defaultValue: 'Delivery error' })}
        </p>
      )}
    </div>
  );
}
