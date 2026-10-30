import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSparkyGymInvitation,
  controlSparkyGym,
  getSparkyGymStatus,
  type SparkyGymAction,
} from '@/api/Integrations/sparkyGym';

export type { SparkyGymAction };

export function useSparkyGym(ownerId: string | undefined) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['sparkyGym', ownerId],
    queryFn: getSparkyGymStatus,
    enabled: !!ownerId,
    retry: false,
  });
  return {
    query,
    // Never put one-time invitation responses into a mutation/query cache.
    createInvitation: createSparkyGymInvitation,
    controlConnection: async (
      id: string,
      action: SparkyGymAction,
      body: unknown
    ) => {
      await controlSparkyGym(id, action, body);
      await client.invalidateQueries({ queryKey: ['sparkyGym'] });
    },
  };
}
