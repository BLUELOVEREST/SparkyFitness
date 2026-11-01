import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  AppState,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';
import SparkyGymDeliveryStatus from './SparkyGymDeliveryStatus';
import {
  sparkyGymResources,
  type SparkyGymInvitationOffer,
  type SparkyGymConnectionStatus,
} from '@workspace/shared';
import { useServerConfigs } from '../hooks/useServerConfigs';
import { useProfile } from '../hooks/useProfile';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { sparkyGymCopy } from '../utils/sparkyGymCopy';
import {
  createSparkyGymInvitation,
  controlSparkyGym,
  getSparkyGymStatus,
  type SparkyGymAction,
} from '../services/api/sparkyGymApi';

export default function SparkyGymSettings() {
  const { activeConfig } = useServerConfigs();
  // Pairing requires an actual signed-in owner, never a delegated API key.
  if (activeConfig?.authType !== 'session' || !activeConfig.sessionToken)
    return null;
  return <SessionOwnerPanel configId={activeConfig.id} />;
}

function SessionOwnerPanel({ configId }: { configId: string }) {
  const { profile } = useProfile();
  if (!profile?.id) return null;
  return <OwnerPanel key={`${configId}:${profile.id}`} ownerId={profile.id} />;
}

function OwnerPanel({ ownerId }: { ownerId: string }) {
  const { t, i18n } = useTranslation();
  const copy = sparkyGymCopy(t);
  const iconColor = useCSSVariable('--color-text-primary') as string;
  const { activeConfig } = useServerConfigs();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['sparkyGym', activeConfig?.id, ownerId],
    queryFn: getSparkyGymStatus,
    enabled: expanded,
    retry: false,
  });
  useRefetchOnFocus(query.refetch, expanded);
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
  const editing = connections.find((c) => c.connection_id === editingId);
  const hasConnection = connections.some((c) =>
    ['active', 'paused'].includes(c.status)
  );
  const showSetup = !!query.data && (!hasConnection || !!editing);
  const showInvitation =
    invitation &&
    !connections.some(
      (c) =>
        c.connection_id === invitation.connection_id &&
        ['active', 'paused'].includes(c.status)
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
    setSelfOrigin('');
    setOrigin('');
    setInvitation(null);
    setPeerMismatch(false);
  };
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setInvitation(null);
    });
    return () => listener.remove();
  }, []);
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
      if (expanded) await query.refetch();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const confirm = (message: string, operation: () => void) =>
    Alert.alert(t('sparkyGym.title', { defaultValue: 'openGym' }), message, [
      {
        text: t('sparkyGym.cancel', { defaultValue: 'Cancel' }),
        style: 'cancel',
      },
      {
        text: t('sparkyGym.confirm', { defaultValue: 'Confirm' }),
        onPress: operation,
      },
    ]);
  const create = (replacing?: SparkyGymConnectionStatus) =>
    run(async () => {
      setInvitation(null);
      const response = await createSparkyGymInvitation(
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
      confirm(
        t('sparkyGym.rotateConfirm', {
          defaultValue:
            'Create a replacement invitation? Both owners must approve the new pairing.',
        }),
        () => void create(editing)
      );
    } else void create();
  };
  const action = (
    connection: SparkyGymConnectionStatus,
    command: SparkyGymAction
  ) => {
    const counts =
      Object.entries(connection.affected_record_counts)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ') || '0';
    const operation = () =>
      void run(() =>
        controlSparkyGym(
          connection.connection_id,
          command,
          command === 'snapshot'
            ? { include_history: true }
            : command === 'purge'
              ? { confirm: true }
              : {}
        )
      );
    if (command === 'approve')
      confirm(
        t('sparkyGym.approveConfirm', {
          defaultValue:
            'Approve openGym owner {{owner}} at {{origin}}? Affected records: {{counts}}.',
          owner: connection.peer_owner_ref,
          origin: connection.peer_origin,
          counts,
        }),
        operation
      );
    else if (command === 'purge')
      confirm(
        t('sparkyGym.purgeConfirm', {
          defaultValue:
            "Permanently remove this revoked openGym source's imported records? Affected records: {{counts}}. Other sources are preserved.",
          counts,
        }),
        operation
      );
    else if (command === 'revoke')
      confirm(
        t('sparkyGym.revokeConfirm', {
          defaultValue:
            'Revoke this connection? Imported history will be retained.',
        }),
        operation
      );
    else if (command === 'snapshot')
      confirm(
        t('sparkyGym.historyConfirm', {
          defaultValue:
            'Import full history from {{origin}}? Affected records: {{counts}}. Existing Hevy history is preserved.',
          origin: connection.peer_origin,
          counts,
        }),
        operation
      );
    else operation();
  };
  const button = (
    label: string,
    onPress: () => void,
    disabled = busy,
    icon: IconName = 'link'
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className="border border-border rounded-lg px-3 py-3 mr-2 mb-2 flex-row items-center gap-2"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Icon name={icon} size={18} color={iconColor} />
      <Text className="text-text-primary flex-shrink">{label}</Text>
    </Pressable>
  );
  return (
    <View className="mb-4">
      {button(
        t('sparkyGym.title', { defaultValue: 'openGym' }),
        () => {
          setExpanded(!expanded);
          setInvitation(null);
          cancelEdit();
        },
        false
      )}
      {expanded && (
        <View className="gap-3 py-2">
          {showSetup && (
            <View className="gap-3">
              <Text className="text-text-primary">
                {t('sparkyGym.selfOrigin', {
                  defaultValue: 'SparkyFitness LAN URL',
                })}
              </Text>
              <TextInput
                accessibilityLabel={t('sparkyGym.selfOrigin', {
                  defaultValue: 'SparkyFitness LAN URL',
                })}
                value={selfOrigin}
                onChangeText={setSelfOrigin}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://192.168.200.118:3006"
                className="border border-border rounded-lg p-3 text-text-primary"
                editable={!busy}
              />
              <Text className="text-text-primary">
                {t('sparkyGym.peerOrigin', { defaultValue: 'openGym origin' })}
              </Text>
              <TextInput
                accessibilityLabel={t('sparkyGym.peerOrigin', {
                  defaultValue: 'openGym origin',
                })}
                value={origin}
                onChangeText={(value) => {
                  setOrigin(value);
                  setPeerMismatch(false);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://192.168.200.118:3085"
                className="border border-border rounded-lg p-3 text-text-primary"
                editable={!busy}
              />
              {button(
                editing
                  ? t('sparkyGym.rotate', { defaultValue: 'Re-pair' })
                  : t('sparkyGym.invite', {
                      defaultValue: 'Create invitation',
                    }),
                submit,
                busy || !origin || !selfOrigin
              )}
              {editing &&
                button(
                  t('sparkyGym.cancel', { defaultValue: 'Cancel' }),
                  cancelEdit
                )}
              {peerMismatch && (
                <Text accessibilityRole="alert" className="text-text-primary">
                  {t('sparkyGym.peerChangeRequiresPairing', {
                    defaultValue:
                      'Disconnect before pairing a different openGym address.',
                  })}
                </Text>
              )}
            </View>
          )}
          {showInvitation && invitation && (
            <View>
              <Text className="text-text-secondary">
                {t('sparkyGym.expires', {
                  defaultValue: 'Invitation expires {{time}}',
                  time: new Date(invitation.expires_at).toLocaleTimeString(
                    i18n.resolvedLanguage || i18n.language
                  ),
                })}
              </Text>
              {button(
                t('sparkyGym.copy', { defaultValue: 'Copy invitation' }),
                () =>
                  void run(async () => {
                    if (Date.parse(invitation.expires_at) > Date.now())
                      Clipboard.setString(JSON.stringify(invitation));
                  })
              )}
              {button(t('sparkyGym.dismiss', { defaultValue: 'Dismiss' }), () =>
                setInvitation(null)
              )}
            </View>
          )}
          {(error || query.isError) && (
            <Text accessibilityRole="alert" className="text-text-primary">
              {t('sparkyGym.error', {
                defaultValue: 'Unable to update openGym connection.',
              })}
            </Text>
          )}
          {query.isError &&
            button(
              t('sparkyGym.retry', { defaultValue: 'Retry' }),
              () => void query.refetch()
            )}
          {query.isPending && (
            <Text className="text-text-secondary">
              {t('sparkyGym.loading', { defaultValue: 'Loading' })}
            </Text>
          )}
          {query.data?.connections.length === 0 && (
            <Text className="text-text-secondary">
              {t('sparkyGym.empty', { defaultValue: 'No openGym connections' })}
            </Text>
          )}
          {query.data?.connections.map((connection) => (
            <View
              key={connection.connection_id}
              className="border-t border-border pt-3 gap-2"
            >
              <Text selectable className="text-text-primary font-semibold">
                {connection.peer_origin}
              </Text>
              <Text className="text-text-secondary">
                {copy[connection.status]}
                {connection.peer_owner_ref
                  ? ` · ${connection.peer_owner_ref}`
                  : ''}
              </Text>
              {connection.self_origin && (
                <View>
                  <Text className="text-text-secondary">
                    {t('sparkyGym.selfOrigin', {
                      defaultValue: 'SparkyFitness LAN URL',
                    })}
                  </Text>
                  <Text className="text-text-primary">
                    {connection.self_origin}
                  </Text>
                </View>
              )}
              <Text className="text-text-secondary">
                {t('sparkyGym.counts', { defaultValue: 'Affected records' })}:{' '}
                {Object.entries(connection.affected_record_counts)
                  .map(
                    ([key, value]) =>
                      `${
                        copy[key as (typeof sparkyGymResources)[number]]
                      }: ${value}`
                  )
                  .join(', ') || '0'}
              </Text>
              <SparkyGymDeliveryStatus delivery={connection.delivery} />
              <View className="flex-row flex-wrap">
                {(
                  [
                    ['approve', connection.status === 'pending_approval'],
                    ['pause', connection.status === 'active'],
                    ['resume', connection.status === 'paused'],
                    ['snapshot', connection.status === 'active'],
                    [
                      'revoke',
                      !['revoked', 'expired'].includes(connection.status),
                    ],
                    ['purge', connection.status === 'revoked'],
                  ] as const
                )
                  .filter(([, visible]) => visible)
                  .map(([command]) => (
                    <React.Fragment key={command}>
                      {button(
                        copy[command],
                        () => action(connection, command),
                        busy ||
                          (command === 'snapshot' &&
                            connection.delivery.pending > 0),
                        (
                          {
                            approve: 'shield-checkmark',
                            pause: 'pause',
                            resume: 'play',
                            snapshot: 'replay',
                            revoke: 'close',
                            purge: 'trash',
                          } as const
                        )[command]
                      )}
                    </React.Fragment>
                  ))}
                {['active', 'paused'].includes(connection.status) &&
                  button(
                    t('sparkyGym.editConnection', {
                      defaultValue: 'Edit connection',
                    }),
                    () => edit(connection),
                    busy,
                    'settings'
                  )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
