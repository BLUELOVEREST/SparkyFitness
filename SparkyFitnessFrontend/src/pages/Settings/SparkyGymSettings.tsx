import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Pencil,
  Link,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react';
import {
  type SparkyGymInvitationOffer,
  type SparkyGymConnectionStatus,
} from '@workspace/shared';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SparkyGymDeliveryStatus from './SparkyGymDeliveryStatus';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  useSparkyGym,
  type SparkyGymAction,
} from '@/hooks/Integrations/useSparkyGym';

export default function SparkyGymSettings() {
  const { user } = useAuth();
  const { isActingOnBehalf } = useActiveUser();
  if (!user || isActingOnBehalf || user.isDemo) return null;
  return <OwnerPanel key={user.id} />;
}

function OwnerPanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { query, createInvitation, controlConnection } = useSparkyGym(user?.id);
  const [origin, setOrigin] = useState('');
  const [selfOrigin, setSelfOrigin] = useState('');
  const [invitation, setInvitation] = useState<SparkyGymInvitationOffer | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [peerMismatch, setPeerMismatch] = useState(false);
  const connections = query.data?.connections ?? [];
  const editing = connections.find(
    (connection) => connection.connection_id === editingId
  );
  const hasConnection = connections.some((connection) =>
    ['active', 'paused'].includes(connection.status)
  );
  const showSetup = !!query.data && (!hasConnection || !!editing);
  const showInvitation =
    invitation &&
    !connections.some(
      (connection) =>
        connection.connection_id === invitation.connection_id &&
        ['active', 'paused'].includes(connection.status)
    );
  const edit = (connection: SparkyGymConnectionStatus) => {
    setEditingId(connection.connection_id);
    setSelfOrigin(connection.self_origin ?? '');
    setOrigin(connection.peer_origin);
    setInvitation(null);
    setError(false);
    setPeerMismatch(false);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setOrigin('');
    setSelfOrigin('');
    setInvitation(null);
    setPeerMismatch(false);
  };
  useEffect(() => {
    if (!invitation) return;
    const timer = setTimeout(
      () => setInvitation(null),
      Math.max(0, Date.parse(invitation.expires_at) - Date.now())
    );
    return () => clearTimeout(timer);
  }, [invitation]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(false);
    try {
      await operation();
      await query.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const create = (replacing?: SparkyGymConnectionStatus) =>
    run(async () => {
      setInvitation(null);
      const response = await createInvitation(
        {
          peer_origin: origin,
          self_origin: selfOrigin,
        },
        replacing?.connection_id
      );
      setInvitation(response.invitation);
      setEditingId(null);
    });
  const submit = () => {
    if (editing) {
      try {
        if (new URL(origin).origin !== editing.peer_origin) {
          setPeerMismatch(true);
          return;
        }
      } catch {
        setError(true);
        return;
      }
      if (!window.confirm(t('sparkyGym.rotateConfirm'))) return;
    }
    void create(editing);
  };
  const action = (
    connection: SparkyGymConnectionStatus,
    command: SparkyGymAction
  ) => {
    const counts =
      Object.entries(connection.affected_record_counts)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ') || '0';
    const confirmation =
      command === 'approve'
        ? t('sparkyGym.approveConfirm', {
            owner: connection.peer_owner_ref,
            origin: connection.peer_origin,
            counts,
          })
        : command === 'purge'
          ? t('sparkyGym.purgeConfirm', { counts })
          : command === 'revoke'
            ? t('sparkyGym.revokeConfirm')
            : command === 'snapshot'
              ? t('sparkyGym.historyConfirm', {
                  origin: connection.peer_origin,
                  counts,
                })
              : null;
    if (confirmation && !window.confirm(confirmation)) return;
    void run(async () => {
      await controlConnection(
        connection.connection_id,
        command,
        command === 'snapshot'
          ? { include_history: true }
          : command === 'purge'
            ? { confirm: true }
            : {}
      );
    });
  };
  return (
    <AccordionItem value="sparkygym" className="border rounded-lg mb-4">
      <AccordionTrigger className="p-4 hover:no-underline">
        <span className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          {t('sparkyGym.title')}
        </span>
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        {showSetup && (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span>{t('sparkyGym.selfOrigin', 'SparkyFitness LAN URL')}</span>
              <Input
                value={selfOrigin}
                onChange={(e) => setSelfOrigin(e.target.value)}
                placeholder="http://192.168.200.118:3006"
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <label className="block space-y-2">
              <span>{t('sparkyGym.peerOrigin')}</span>
              <Input
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setPeerMismatch(false);
                }}
                placeholder="http://192.168.200.118:3085"
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <Button disabled={busy || !origin || !selfOrigin} onClick={submit}>
              <Link className="mr-2 h-4 w-4" />
              {editing ? t('sparkyGym.rotate') : t('sparkyGym.invite')}
            </Button>
            {editing && (
              <Button variant="ghost" disabled={busy} onClick={cancelEdit}>
                {t('sparkyGym.cancel')}
              </Button>
            )}
            {peerMismatch && (
              <p role="alert">{t('sparkyGym.peerChangeRequiresPairing')}</p>
            )}
          </div>
        )}
        {showInvitation && invitation && (
          <div className="space-y-2" role="status">
            <p>
              {t('sparkyGym.expires', {
                time: new Date(invitation.expires_at).toLocaleTimeString(),
              })}
            </p>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (Date.parse(invitation.expires_at) <= Date.now()) return;
                  const text = JSON.stringify(invitation);
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                    return;
                  }
                  // LAN HTTP has no secure-context Clipboard API.
                  const previous = document.activeElement;
                  const field = document.createElement('textarea');
                  field.value = text;
                  field.readOnly = true;
                  field.style.position = 'fixed';
                  field.style.opacity = '0';
                  document.body.append(field);
                  try {
                    field.select();
                    if (!document.execCommand('copy'))
                      throw new Error('copy_failed');
                  } finally {
                    field.remove();
                    if (previous instanceof HTMLElement) previous.focus();
                  }
                })
              }
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('sparkyGym.copy')}
            </Button>
            <Button variant="ghost" onClick={() => setInvitation(null)}>
              {t('sparkyGym.dismiss')}
            </Button>
          </div>
        )}
        {(error || query.isError) && <p role="alert">{t('sparkyGym.error')}</p>}
        {query.isPending && <p>{t('sparkyGym.loading')}</p>}
        {query.isError && (
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('sparkyGym.retry')}
          </Button>
        )}
        {query.data?.connections.length === 0 && <p>{t('sparkyGym.empty')}</p>}
        {query.data?.connections.map((connection) => (
          <section
            key={connection.connection_id}
            className="border-t pt-4 space-y-2"
          >
            <p className="font-medium break-all">{connection.peer_origin}</p>
            {connection.self_origin && (
              <dl className="text-sm text-muted-foreground">
                <dt>{t('sparkyGym.selfOrigin')}</dt>
                <dd className="break-all">{connection.self_origin}</dd>
              </dl>
            )}
            <p>
              {t(`sparkyGym.${connection.status}`)}
              {connection.peer_owner_ref
                ? ` · ${connection.peer_owner_ref}`
                : ''}
            </p>
            <p>
              {t('sparkyGym.counts')}:{' '}
              {Object.entries(connection.affected_record_counts)
                .map(([key, value]) => `${t(`sparkyGym.${key}`)}: ${value}`)
                .join(', ') || '0'}
            </p>
            <SparkyGymDeliveryStatus delivery={connection.delivery} />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  [
                    'approve',
                    ShieldCheck,
                    connection.status === 'pending_approval',
                  ],
                  ['pause', Pause, connection.status === 'active'],
                  ['resume', Play, connection.status === 'paused'],
                  ['snapshot', RefreshCw, connection.status === 'active'],
                  [
                    'revoke',
                    Unplug,
                    !['revoked', 'expired'].includes(connection.status),
                  ],
                  ['purge', Trash2, connection.status === 'revoked'],
                ] as const
              )
                .filter(([, , visible]) => visible)
                .map(([command, Icon]) => (
                  <Button
                    key={command}
                    variant="outline"
                    disabled={
                      busy ||
                      (command === 'snapshot' &&
                        connection.delivery.pending > 0)
                    }
                    onClick={() => action(connection, command)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {command === 'snapshot'
                      ? t('sparkyGym.syncHistory', 'Sync history')
                      : t(`sparkyGym.${command}`)}
                  </Button>
                ))}
              {['active', 'paused'].includes(connection.status) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => edit(connection)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('sparkyGym.editConnection')}
                </Button>
              )}
            </div>
          </section>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}
