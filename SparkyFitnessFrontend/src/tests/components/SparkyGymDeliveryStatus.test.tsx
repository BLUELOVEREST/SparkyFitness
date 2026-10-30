import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SparkyGymDeliveryStatus from '@/pages/Settings/SparkyGymDeliveryStatus';
jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
describe('openGym delivery diagnostics', () => {
  it('renders actual queue and media counts with a terminal error', () => {
    render(
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
    expect(screen.getByText('Pending: 4')).toBeInTheDocument();
    expect(screen.getByText('Failed: 2')).toBeInTheDocument();
    expect(screen.getByText('Pending media: 3')).toBeInTheDocument();
    expect(screen.getByText('INVALID_PAYLOAD')).toBeInTheDocument();
  });
  it('does not render arbitrary error text as a machine code', () => {
    render(
      <SparkyGymDeliveryStatus
        delivery={{
          pending: 0,
          failed: 1,
          pending_media: 0,
          last_success_at: '2026-10-29T12:00:00.000Z',
          last_error_code: 'secret=do-not-render',
        }}
      />
    );
    expect(screen.queryByText(/do-not-render/)).not.toBeInTheDocument();
    expect(screen.getByText('Delivery error')).toBeInTheDocument();
    expect(screen.getByText(/Last successful delivery/)).toBeInTheDocument();
  });
});
