import { z } from 'zod';

// Internal background ledger, deliberately not an owner-facing API contract.
export const sparkyGymArchiveCleanupJobSchema = z.object({
  owner_id: z.uuid(),
  attempts: z.number().int().min(0).max(20),
  next_due_at: z.date(),
  last_error: z
    .enum(['archive_cleanup_failed', 'owner_still_exists'])
    .nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type SparkyGymArchiveCleanupJob = z.infer<
  typeof sparkyGymArchiveCleanupJobSchema
>;
