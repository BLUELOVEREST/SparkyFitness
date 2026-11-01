import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ImportedProgressPhoto } from '@workspace/shared';
import {
  fetchImportedProgressPhotos,
  importedProgressPhotosRootKey,
} from '../services/api/importedProgressPhotosApi';
import { useAuthedImageSource } from '../hooks/useAuthedImageSource';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import Icon from './Icon';
import { useServerConfigs } from '../hooks/useServerConfigs';
import { useProfile } from '../hooks/useProfile';

/** No angles or local edit controls: openGym owns these existing archives. */
export default function ImportedProgressPhotos() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<ImportedProgressPhoto | null>(null);
  const { activeConfig } = useServerConfigs();
  const { profile } = useProfile();
  const enabled = !!activeConfig && !!profile?.id;
  const { getPhotoSource } = useAuthedImageSource(
    '/api/integrations/sparkygym/media/'
  );
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [
      ...importedProgressPhotosRootKey,
      activeConfig?.id,
      activeConfig?.url,
      profile?.id,
    ],
    queryFn: fetchImportedProgressPhotos,
    staleTime: 0,
    refetchOnMount: 'always',
    enabled,
  });
  useRefetchOnFocus(refetch, enabled);
  if (!enabled) return null;
  const viewed =
    !isError && selected
      ? data?.find(
          (photo) =>
            photo.id === selected.id && photo.entry_date === selected.entry_date
        )
      : undefined;
  if (!isPending && !isError && !data?.length) return null;

  return (
    <View className="px-4 pt-3">
      <Text className="text-text-primary text-sm font-semibold mb-2">
        {t('importedProgressPhotos.title', {
          defaultValue: 'openGym photos (read-only)',
        })}
      </Text>
      {isPending && (
        <ActivityIndicator
          accessibilityLabel={t('importedProgressPhotos.loading', {
            defaultValue: 'Loading imported photos...',
          })}
        />
      )}
      {isError ? (
        <View>
          <Text className="text-text-secondary text-sm">
            {t('importedProgressPhotos.loadError', {
              defaultValue: 'Could not load imported photos.',
            })}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refetch()}
            className="py-2"
          >
            <Text className="text-text-primary">
              {t('importedProgressPhotos.retry', { defaultValue: 'Retry' })}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {data?.map((photo) => {
            const source = getPhotoSource(photo.id);
            return (
              <Pressable
                key={`${photo.id}:${photo.entry_date}`}
                accessibilityRole="button"
                accessibilityLabel={t('importedProgressPhotos.openPhoto', {
                  defaultValue: 'View openGym photo from {{date}}',
                  date: photo.entry_date,
                })}
                onPress={() => setSelected(photo)}
                style={{ width: 104, marginRight: 12 }}
              >
                {source && (
                  <Image
                    source={source}
                    cachePolicy="none"
                    contentFit="contain"
                    style={{ width: 104, height: 128, borderRadius: 8 }}
                    accessibilityLabel={t('importedProgressPhotos.photo', {
                      defaultValue: 'openGym progress photo',
                    })}
                  />
                )}
                <Text className="text-text-secondary text-xs mt-1">
                  {photo.entry_date}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <Modal
        visible={!!viewed}
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View
          className="flex-1 bg-black"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
            onPress={() => setSelected(null)}
            className="self-end p-4"
          >
            <Icon name="close" size={24} color="#fff" />
          </Pressable>
          {viewed && (
            <Image
              source={getPhotoSource(viewed.id)}
              cachePolicy="none"
              contentFit="contain"
              style={{ flex: 1 }}
              accessibilityLabel={t('importedProgressPhotos.photo', {
                defaultValue: 'openGym progress photo',
              })}
            />
          )}
          <Text className="text-white text-center py-4">
            {viewed?.entry_date}
          </Text>
        </View>
      </Modal>
    </View>
  );
}
