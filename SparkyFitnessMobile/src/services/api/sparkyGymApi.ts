import {
  sparkyGymCreateInvitationRequestSchema,
  sparkyGymStatusResponseSchema,
  sparkyGymControlResponseSchema,
  sparkyGymInvitationResponseSchema,
  sparkyGymPurgeRequestSchema,
  sparkyGymSnapshotRequestSchema,
  type SparkyGymCreateInvitationRequest,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const root = '/api/integrations/sparkygym';
export type SparkyGymAction =
  'approve' | 'pause' | 'resume' | 'revoke' | 'snapshot' | 'purge';
const request = (endpoint: string, body?: unknown) =>
  apiFetch<unknown>({
    endpoint,
    serviceName: 'SparkyGym',
    operation: 'manage connection',
    ...(body ? { method: 'POST', body } : {}),
  });
export async function getSparkyGymStatus() {
  return sparkyGymStatusResponseSchema.parse(await request(root));
}
export async function createSparkyGymInvitation(
  input: SparkyGymCreateInvitationRequest,
  replacingId?: string
) {
  const body = sparkyGymCreateInvitationRequestSchema.parse(input);
  const endpoint = replacingId
    ? `${root}/${encodeURIComponent(replacingId)}/rotate`
    : `${root}/invitations`;
  return sparkyGymInvitationResponseSchema.parse(await request(endpoint, body));
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
    await request(`${root}/${encodeURIComponent(id)}/${action}`, body)
  );
}
