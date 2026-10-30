import React from 'react';
import { render } from '@testing-library/react-native';
import SparkyGymDeliveryStatus from '../../src/components/SparkyGymDeliveryStatus';
jest.mock('../../src/localization', () => ({
  formatLocalizedNumber: (value: number) => String(value),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (
      key: string,
      options: { defaultValue: string; value?: string; time?: string }
    ) =>
      options.defaultValue
        .replace('{{value}}', String(options.value))
        .replace('{{time}}', options.time ?? ''),
  }),
}));
describe('openGym delivery diagnostics', () => {
  it('shows real pending, failure and archive counts', () => {
    const screen = render(
      <SparkyGymDeliveryStatus
        delivery={{
          pending: 4,
          failed: 2,
          pending_media: 3,
          last_success_at: null,
          last_error_code: 'INVALID_PAYLOAD',
        }}
      />
    );
    expect(screen.getByText('Pending: 4')).toBeTruthy();
    expect(screen.getByText('Failed: 2')).toBeTruthy();
    expect(screen.getByText('Pending media: 3')).toBeTruthy();
    expect(screen.getByText('INVALID_PAYLOAD')).toBeTruthy();
  });
  it('never displays raw error details', () => {
    const screen = render(
      <SparkyGymDeliveryStatus
        delivery={{
          pending: 0,
          failed: 1,
          pending_media: 0,
          last_success_at: null,
          last_error_code: 'secret=do-not-render',
        }}
      />
    );
    expect(screen.queryByText(/do-not-render/)).toBeNull();
    expect(screen.getByText('Delivery error')).toBeTruthy();
  });
});
