import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportedProgressPhoto } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useImportedProgressPhotos } from '@/hooks/CheckIn/useImportedProgressPhotos';

/** Imports have no angle: keep them out of the native front/back/side slots. */
export function ImportedProgressPhotos() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ImportedProgressPhoto | null>(null);
  const {
    photos: data,
    enabled,
    isPending,
    isError,
    refetch,
    photoUrl,
  } = useImportedProgressPhotos();
  if (!enabled) return null;
  // Never keep a removed/tombstoned photo open after the list refreshes.
  const viewed =
    selected &&
    data?.find(
      (photo) =>
        photo.id === selected.id && photo.entry_date === selected.entry_date
    );
  if (!isPending && !isError && !data?.length) return null;

  return (
    <section
      className="px-6 pb-6"
      aria-label={t(
        'importedProgressPhotos.title',
        'openGym photos (read-only)'
      )}
    >
      <h3 className="text-sm font-medium mb-3">
        {t('importedProgressPhotos.title', 'openGym photos (read-only)')}
      </h3>
      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('importedProgressPhotos.loading', 'Loading imported photos...')}
        </p>
      )}
      {isError ? (
        <div role="alert" className="text-sm">
          <p>
            {t(
              'importedProgressPhotos.loadError',
              'Could not load imported photos.'
            )}
          </p>
          <Button type="button" variant="ghost" onClick={() => void refetch()}>
            {t('importedProgressPhotos.retry', 'Retry')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
          {data?.map((photo) => (
            <button
              key={`${photo.id}:${photo.entry_date}`}
              type="button"
              className="min-w-0 text-left"
              onClick={() => setSelected(photo)}
              aria-label={t(
                'importedProgressPhotos.openPhoto',
                'View openGym photo from {{date}}',
                { date: photo.entry_date }
              )}
            >
              <img
                src={photoUrl(photo.id)}
                alt={t(
                  'importedProgressPhotos.photo',
                  'openGym progress photo'
                )}
                loading="lazy"
                className="w-full aspect-[3/4] object-contain rounded-lg bg-muted"
              />
              <span className="block text-sm mt-1">{photo.entry_date}</span>
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={!!viewed && !isError}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogTitle>
            {viewed?.entry_date} ·{' '}
            {t('importedProgressPhotos.title', 'openGym photos (read-only)')}
          </DialogTitle>
          {viewed && (
            <img
              src={photoUrl(viewed.id)}
              alt={t('importedProgressPhotos.photo', 'openGym progress photo')}
              className="w-full max-h-[75vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
