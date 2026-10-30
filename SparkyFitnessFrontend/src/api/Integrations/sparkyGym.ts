import {
  sparkyGymCreateInvitationRequestSchema,
  sparkyGymStatusResponseSchema,
  sparkyGymControlResponseSchema,
  sparkyGymInvitationResponseSchema,
  sparkyGymPurgeRequestSchema,
  sparkyGymSnapshotRequestSchema,
  type SparkyGymCreateInvitationRequest,
} from '@workspace/shared';
import { apiCall } from '@/api/api';

const root = '/integrations/sparkygym';
export type SparkyGymAction =
  'approve' | 'pause' | 'resume' | 'revoke' | 'snapshot' | 'purge';

export async function getSparkyGymStatus() {
  return sparkyGymStatusResponseSchema.parse(await apiCall<unknown>(root));
}
export async function createSparkyGymInvitation(
  input: SparkyGymCreateInvitationRequest,
  replacingId?: string
) {
  const body = sparkyGymCreateInvitationRequestSchema.parse(input);
  const endpoint = replacingId
    ? `${root}/${encodeURIComponent(replacingId)}/rotate`
    : `${root}/invitations`;
  // Blob mode deliberately bypasses apiCall's JSON response debug logger.
  const response = await apiCall(endpoint, {
    method: 'POST',
    body,
    responseType: 'blob',
  });
  return sparkyGymInvitationResponseSchema.parse(
    JSON.parse(await response.text())
  );
}
export async function controlSparkyGym(
  id: string,
  action: SparkyGymAction,
  input: unknown = {}
) {
  const body =
    action === 'purge'
      ? sparkyGymPurgeRequestSchema.parse(input)
      : action === 'snapshot'
        ? sparkyGymSnapshotRequestSchema.parse(input)
        : {};
  return sparkyGymControlResponseSchema.parse(
    await apiCall<unknown>(`${root}/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      body,
    })
  );
}
