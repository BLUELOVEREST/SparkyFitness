import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Link,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react';
import {
  sparkyGymResources,
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
  const [scopes, setScopes] = useState<(typeof sparkyGymResources)[number][]>([
    'exercise',
    'workout',
  ]);
  const [history, setHistory] = useState(false);
  const [http, setHttp] = useState(false);
  const [privateNetwork, setPrivateNetwork] = useState(false);
  const [invitation, setInvitation] = useState<SparkyGymInvitationOffer | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
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
          peer_origin: replacing?.peer_origin ?? origin,
          scopes: replacing?.scopes ?? scopes,
          include_history: history,
          allow_http: http,
          allow_private_network: privateNetwork,
        },
        replacing?.connection_id
      );
      setInvitation(response.invitation);
    });
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
            : command === 'snapshot' && history
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
          ? { include_history: history }
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
        <label className="block space-y-2">
          <span>{t('sparkyGym.peerOrigin')}</span>
          <Input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="https://gym.example"
            autoComplete="off"
          />
        </label>
        <fieldset className="flex flex-wrap gap-3">
          <legend>{t('sparkyGym.scopes')}</legend>
          {sparkyGymResources.map((scope) => (
            <label key={scope} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={(e) =>
                  setScopes((current) =>
                    e.target.checked
                      ? [...current, scope]
                      : current.filter((item) => item !== scope)
                  )
                }
              />
              {t(`sparkyGym.${scope}`)}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-4">
          {(
            [
              [history, setHistory, 'history'],
              [http, setHttp, 'allowHttp'],
              [privateNetwork, setPrivateNetwork, 'allowPrivate'],
            ] as const
          ).map(([checked, update, key]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => update(e.target.checked)}
              />
              {t(`sparkyGym.${key}`)}
            </label>
          ))}
        </div>
        <Button
          disabled={busy || !origin || !scopes.length}
          onClick={() => void create()}
        >
          <Link className="mr-2 h-4 w-4" />
          {t('sparkyGym.invite')}
        </Button>
        {invitation && (
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
                  if (Date.parse(invitation.expires_at) > Date.now())
                    await navigator.clipboard.writeText(
                      JSON.stringify(invitation)
                    );
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
            <p>
              {t(`sparkyGym.${connection.status}`)}
              {connection.peer_owner_ref
                ? ` · ${connection.peer_owner_ref}`
                : ''}
            </p>
            <p>
              {t('sparkyGym.scopes')}:{' '}
              {connection.scopes
                .map((scope) => t(`sparkyGym.${scope}`))
                .join(', ')}
            </p>
            <p>
              {t('sparkyGym.history')}: {String(connection.include_history)}
            </p>
            <p>
              {t('sparkyGym.counts')}:{' '}
              {Object.entries(connection.affected_record_counts)
                .map(([key, value]) => `${t(`sparkyGym.${key}`)}: ${value}`)
                .join(', ') || '0'}
            </p>
            <SparkyGymDeliveryStatus delivery={connection.delivery} />
            {connection.capabilities && (
              <p>
                {t('sparkyGym.capabilities')}:{' '}
                {connection.capabilities.resources
                  .map((resource) => t(`sparkyGym.${resource}`))
                  .join(', ')}
              </p>
            )}
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
                    disabled={busy}
                    onClick={() => action(connection, command)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {t(`sparkyGym.${command}`)}
                  </Button>
                ))}
              {['active', 'paused'].includes(connection.status) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('sparkyGym.rotateConfirm')))
                      void create(connection);
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('sparkyGym.rotate')}
                </Button>
              )}
            </div>
          </section>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}
