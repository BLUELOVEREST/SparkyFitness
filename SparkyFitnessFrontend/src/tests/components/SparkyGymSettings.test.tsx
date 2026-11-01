import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SparkyGymSettings from '@/pages/Settings/SparkyGymSettings';
import { Accordion } from '@/components/ui/accordion';
import type { SparkyGymConnectionStatus } from '@workspace/shared';
let mockConnections: SparkyGymConnectionStatus[] = [];
const mockCreate = jest.fn();
const mockControl = jest.fn();
const mockRefetch = jest.fn();
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: false }),
}));
jest.mock('@/hooks/Integrations/useSparkyGym', () => ({
  useSparkyGym: () => ({
    query: { refetch: mockRefetch, data: { connections: mockConnections } },
    createInvitation: mockCreate,
    controlConnection: mockControl,
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

beforeEach(() => {
  mockConnections = [];
  jest.clearAllMocks();
});

it.each(['active', 'paused'] as const)(
  'collapses URL setup for %s connections and supports explicit edit/cancel',
  (status) => {
    mockConnections = [
      {
        connection_id: '00000000-0000-4000-8000-000000000001',
        status,
        self_origin: 'http://192.168.200.118:3006',
        peer_origin: 'http://192.168.200.118:3085',
        peer_owner_ref: 'peer',
        scopes: ['workout'],
        include_history: true,
        affected_record_counts: {},
        capabilities: null,
        delivery: {
          pending: 0,
          failed: 0,
          pending_media: 0,
          last_success_at: null,
          last_error_code: null,
        },
      },
    ];
    render(
      <Accordion type="multiple" defaultValue={['sparkygym']}>
        <SparkyGymSettings />
      </Accordion>
    );
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText('http://192.168.200.118:3006')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'sparkyGym.editConnection' })
    );
    expect(screen.getByLabelText('sparkyGym.selfOrigin')).toHaveValue(
      'http://192.168.200.118:3006'
    );
    expect(screen.getByLabelText('sparkyGym.peerOrigin')).toHaveValue(
      'http://192.168.200.118:3085'
    );
    fireEvent.change(screen.getByLabelText('sparkyGym.selfOrigin'), {
      target: { value: 'http://192.168.200.118:3007' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'sparkyGym.cancel' }));
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'sparkyGym.editConnection' })
    );
    expect(screen.getByLabelText('sparkyGym.selfOrigin')).toHaveValue(
      'http://192.168.200.118:3006'
    );
  }
);

it.each(['invited', 'pending_approval'] as const)(
  'keeps setup recoverable before pairing succeeds (%s)',
  (status) => {
    mockConnections = [
      {
        connection_id: '00000000-0000-4000-8000-000000000001',
        status,
        peer_origin: 'http://192.168.200.118:3085',
        peer_owner_ref: null,
        scopes: ['workout'],
        include_history: true,
        affected_record_counts: {},
        capabilities: null,
        delivery: {
          pending: 0,
          failed: 0,
          pending_media: 0,
          last_success_at: null,
          last_error_code: null,
        },
      },
    ];
    render(
      <Accordion type="multiple" defaultValue={['sparkygym']}>
        <SparkyGymSettings />
      </Accordion>
    );
    expect(screen.getByLabelText('sparkyGym.selfOrigin')).toBeInTheDocument();
    expect(screen.getByLabelText('sparkyGym.peerOrigin')).toBeInTheDocument();
  }
);

it('offers only LAN origins, with no scope, history or network checkboxes', async () => {
  mockCreate.mockResolvedValue({
    invitation: { expires_at: new Date(Date.now() + 600000).toISOString() },
  });
  render(
    <Accordion type="multiple" defaultValue={['sparkygym']}>
      <SparkyGymSettings />
    </Accordion>
  );
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  fireEvent.change(screen.getByLabelText('sparkyGym.selfOrigin'), {
    target: { value: 'http://192.168.200.118:3006' },
  });
  fireEvent.change(screen.getByLabelText('sparkyGym.peerOrigin'), {
    target: { value: 'http://192.168.200.118:3085' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'sparkyGym.invite' }));
  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith(
      {
        self_origin: 'http://192.168.200.118:3006',
        peer_origin: 'http://192.168.200.118:3085',
      },
      undefined
    )
  );
});

it('copies invitations on LAN HTTP without the secure-context Clipboard API', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  const copy = jest.fn(() => true);
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: copy,
  });
  mockCreate.mockResolvedValue({
    invitation: {
      secret: 'one-time-only',
      expires_at: new Date(Date.now() + 600000).toISOString(),
    },
  });
  render(
    <Accordion type="multiple" defaultValue={['sparkygym']}>
      <SparkyGymSettings />
    </Accordion>
  );
  fireEvent.change(screen.getByLabelText('sparkyGym.selfOrigin'), {
    target: { value: 'http://192.168.200.118:3006' },
  });
  fireEvent.change(screen.getByLabelText('sparkyGym.peerOrigin'), {
    target: { value: 'http://192.168.200.118:3085' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'sparkyGym.invite' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'sparkyGym.copy' })
  );
  await waitFor(() => expect(copy).toHaveBeenCalledWith('copy'));
  expect(document.querySelector('textarea')).toBeNull();
});

it('requests full history only after explicit confirmation and blocks clicks while deliveries are pending', async () => {
  const connection: SparkyGymConnectionStatus = {
    connection_id: '00000000-0000-4000-8000-000000000001',
    status: 'active',
    peer_origin: 'http://192.168.200.118:3085',
    peer_owner_ref: 'peer',
    scopes: ['workout'],
    include_history: true,
    affected_record_counts: {},
    capabilities: null,
    delivery: {
      pending: 0,
      failed: 0,
      pending_media: 0,
      last_success_at: null,
      last_error_code: null,
    },
  };
  mockConnections = [connection];
  mockControl.mockClear();
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  const view = render(
    <Accordion type="multiple" defaultValue={['sparkygym']}>
      <SparkyGymSettings />
    </Accordion>
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'sparkyGym.syncHistory' })
  );
  expect(mockControl).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'sparkyGym.syncHistory' })
  );
  await waitFor(() =>
    expect(mockControl).toHaveBeenCalledWith(
      connection.connection_id,
      'snapshot',
      { include_history: true }
    )
  );
  mockConnections = [
    { ...connection, delivery: { ...connection.delivery, pending: 1 } },
  ];
  view.rerender(
    <Accordion type="multiple" defaultValue={['sparkygym']}>
      <SparkyGymSettings />
    </Accordion>
  );
  expect(
    screen.getByRole('button', { name: 'sparkyGym.syncHistory' })
  ).toBeDisabled();
  confirm.mockRestore();
  mockConnections = [];
});

it('edits through confirmed re-pairing and never silently changes a peer binding', async () => {
  const connection: SparkyGymConnectionStatus = {
    connection_id: '00000000-0000-4000-8000-000000000001',
    status: 'active',
    self_origin: 'http://192.168.200.118:3006',
    peer_origin: 'http://192.168.200.118:3085',
    peer_owner_ref: 'peer',
    scopes: ['workout'],
    include_history: true,
    affected_record_counts: {},
    capabilities: null,
    delivery: {
      pending: 0,
      failed: 0,
      pending_media: 0,
      last_success_at: null,
      last_error_code: null,
    },
  };
  mockConnections = [connection];
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    render(
      <Accordion type="multiple" defaultValue={['sparkygym']}>
        <SparkyGymSettings />
      </Accordion>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'sparkyGym.editConnection' })
    );
    fireEvent.change(screen.getByLabelText('sparkyGym.selfOrigin'), {
      target: { value: 'http://192.168.200.118:3007' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'sparkyGym.rotate' }));
    expect(mockCreate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('sparkyGym.peerOrigin'), {
      target: { value: 'http://192.168.200.118:3086' },
    });
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'sparkyGym.rotate' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'sparkyGym.peerChangeRequiresPairing'
    );
    expect(mockCreate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('sparkyGym.peerOrigin'), {
      target: { value: connection.peer_origin },
    });
    mockCreate.mockResolvedValue({
      invitation: { expires_at: new Date(Date.now() + 600000).toISOString() },
    });
    fireEvent.click(screen.getByRole('button', { name: 'sparkyGym.rotate' }));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        {
          self_origin: 'http://192.168.200.118:3007',
          peer_origin: connection.peer_origin,
        },
        connection.connection_id
      )
    );
    expect(mockControl).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  } finally {
    confirm.mockRestore();
  }
});
