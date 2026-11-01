import {
  importedProgressPhotoSchema,
  type ImportedProgressPhoto,
} from '@workspace/shared';
import { withOwnerTransaction } from './sparkyGymRepository.js';

/** Reads the existing archive projection; never materializes check-in rows. */
export async function listImportedProgressPhotos(
  owner: string
): Promise<ImportedProgressPhoto[]> {
  return withOwnerTransaction(owner, async (client) => {
    const result = await client.query(
      `SELECT DISTINCT m.id, e.raw_payload->>'date' AS entry_date, 'opengym' AS source
       FROM sparkygym_entities e JOIN sparkygym_media m
         ON e.local_id = m.id::text AND e.user_id = m.user_id
       WHERE e.user_id = $1 AND e.resource = 'personal_media' AND NOT e.tombstone
         AND e.raw_payload->>'kind' = 'progress'
         AND e.raw_payload->>'workout_id' IS NULL
         AND m.status = 'ready' AND m.private_path IS NOT NULL
         AND m.mime LIKE 'image/%'
       ORDER BY entry_date DESC, m.id`,
      [owner]
    );
    return result.rows.flatMap((row: unknown) => {
      const parsed = importedProgressPhotoSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  });
}
