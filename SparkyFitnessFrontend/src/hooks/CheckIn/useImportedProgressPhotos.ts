import { useQuery } from '@tanstack/react-query';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  fetchImportedProgressPhotos,
  importedProgressPhotoUrl,
} from '@/api/CheckIn/importedProgressPhotoService';

export function useImportedProgressPhotos() {
  const { activeUserId, isActingOnBehalf } = useActiveUser();
  const enabled = !!activeUserId && !isActingOnBehalf;
  const query = useQuery({
    queryKey: ['imported-progress-photos', activeUserId],
    queryFn: fetchImportedProgressPhotos,
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  return {
    photos: enabled ? query.data : undefined,
    enabled,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    photoUrl: importedProgressPhotoUrl,
  };
}
