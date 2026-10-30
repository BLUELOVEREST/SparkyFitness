import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  instantHourMinute,
  sparkyGymDomainEventSchema,
  type SparkyGymDomainEvent,
  type SparkyGymExercisePayload,
  type SparkyGymWorkoutPayload,
  type SparkyGymWorkoutExercisePayload,
  type SparkyGymPersonalMediaPayload,
  type ExerciseModality,
} from '@workspace/shared';

function digest(parts: string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
function sourcePrefix(peerOwnerRef: string): string {
  return `opengym:${digest([peerOwnerRef])}:`;
}
function sourceId(
  peerOwnerRef: string,
  resource: string,
  ...ids: string[]
): string {
  return `${sourcePrefix(peerOwnerRef)}${digest([resource, ...ids])}`;
}
function nativeId(
  ownerId: string,
  peerOwnerRef: string,
  resource: string,
  ...ids: string[]
): string {
  const hex = digest([ownerId, peerOwnerRef, resource, ...ids]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// The caller owns BEGIN/COMMIT, RLS owner context, inbox/entity writes and revisions.
async function importing(
  client: PoolClient,
  operation: () => Promise<void>
): Promise<void> {
  const previous = await client.query<{ import_mode: string | null }>(
    `SELECT current_setting('app.sparkygym_import', true) AS import_mode
`
  );
  const mode = previous.rows[0]?.import_mode ?? '';
  await client.query(
    `SELECT set_config('app.sparkygym_import', $1, true)
`,
    ['on']
  );
  try {
    await operation();
  } catch (error) {
    // A failed SQL statement aborts the caller's transaction. Its rollback also
    // restores SET LOCAL; do not replace that original error with a reset error.
    try {
      await client.query(
        `SELECT set_config('app.sparkygym_import', $1, true)
`,
        [mode]
      );
    } catch {
      /* transaction aborted */
    }
    throw error;
  }
  await client.query(
    `SELECT set_config('app.sparkygym_import', $1, true)
`,
    [mode]
  );
}

async function applyExercise(
  client: PoolClient,
  ownerId: string,
  peerOwnerRef: string,
  payload: SparkyGymExercisePayload,
  definitionEvent: boolean,
  summary = false
): Promise<string> {
  const resource = summary ? 'workout_summary_exercise' : 'exercise';
  const id = nativeId(ownerId, peerOwnerRef, resource, payload.exercise_id);
  const result = await client.query(
    `INSERT INTO exercises (id, user_id, source_id, name, category, description,
       equipment, primary_muscles, secondary_muscles, calories_per_hour, images,
       is_custom, shared_with_public, source, modality, is_quick_exercise)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, FALSE, 'opengym', 'weight_reps', $13)
     ON CONFLICT (id) DO UPDATE SET
       name = CASE WHEN $12 THEN EXCLUDED.name ELSE exercises.name END,
       category = CASE WHEN $12 THEN EXCLUDED.category ELSE exercises.category END,
       description = CASE WHEN $12 THEN EXCLUDED.description ELSE exercises.description END,
       equipment = CASE WHEN $12 THEN EXCLUDED.equipment ELSE exercises.equipment END,
       primary_muscles = CASE WHEN $12 THEN EXCLUDED.primary_muscles ELSE exercises.primary_muscles END,
       secondary_muscles = CASE WHEN $12 THEN EXCLUDED.secondary_muscles ELSE exercises.secondary_muscles END,
       updated_at = now()
     WHERE exercises.user_id = $2 AND exercises.source = 'opengym' AND exercises.source_id = $3`,
    [
      id,
      ownerId,
      sourceId(peerOwnerRef, resource, payload.exercise_id),
      payload.name,
      payload.category,
      payload.notes,
      JSON.stringify(payload.equipment),
      JSON.stringify(payload.primary_muscles),
      JSON.stringify(payload.secondary_muscles),
      null,
      null,
      definitionEvent,
      summary,
    ]
  );
  if (result.rowCount !== 1)
    throw new Error('sparkygym_native_identity_conflict');
  return id;
}

async function applyWorkout(
  client: PoolClient,
  ownerId: string,
  peerOwnerRef: string,
  payload: SparkyGymWorkoutPayload
): Promise<string> {
  const parentId = nativeId(
    ownerId,
    peerOwnerRef,
    'workout',
    payload.workout_id
  );
  const parentSourceId = sourceId(peerOwnerRef, 'workout', payload.workout_id);
  const parent = await client.query(
    `INSERT INTO exercise_preset_entries (id, user_id, source_id, name, entry_date, created_by_user_id, source, notes, source_summary)
     VALUES ($1, $2, $3, $4, $5, $2, 'opengym', 'sparkygym_source_owned', $6::jsonb)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, entry_date = EXCLUDED.entry_date,
       source_summary = EXCLUDED.source_summary, updated_at = now()
     WHERE exercise_preset_entries.user_id = $2 AND exercise_preset_entries.source = 'opengym' AND exercise_preset_entries.source_id = $3`,
    [
      parentId,
      ownerId,
      parentSourceId,
      payload.name.slice(0, 255),
      payload.date,
      JSON.stringify({
        duration_seconds: payload.duration_seconds,
        calories_kcal: payload.calories_kcal,
      }),
    ]
  );
  if (parent.rowCount !== 1)
    throw new Error('sparkygym_native_identity_conflict');
  const instances: SparkyGymWorkoutExercisePayload[] = [
    ...payload.exercises,
  ].sort(
    (a, b) =>
      a.position - b.position || a.instance_id.localeCompare(b.instance_id)
  );
  const entryIds: string[] = [];
  for (const exercise of instances) {
    const exerciseId = await applyExercise(
      client,
      ownerId,
      peerOwnerRef,
      {
        exercise_id: exercise.exercise_id,
        name: exercise.name,
        category: 'general',
        equipment: [],
        primary_muscles: [],
        secondary_muscles: [],
        aliases: [],
        notes: '',
      },
      false
    );
    const entryId = nativeId(
      ownerId,
      peerOwnerRef,
      'workout_instance',
      payload.workout_id,
      exercise.instance_id
    );
    entryIds.push(entryId);
    const flags = ['sparkygym_source_owned'];
    // Native action columns are NOT NULL; zero is not an observed action total.
    flags.push(
      'sparkygym_unknown_calories_kcal',
      'sparkygym_unknown_duration_seconds'
    );
    const hasReps = exercise.sets.some((set) => set.reps !== null);
    const hasWeight = exercise.sets.some(
      (set) => set.load_mode === 'total' && set.weight_kg !== null
    );
    const modality: ExerciseModality = hasReps
      ? hasWeight
        ? 'weight_reps'
        : 'reps_only'
      : exercise.sets.some((set) => set.distance_meters !== null)
        ? 'duration_distance'
        : 'duration';
    let entryTime: string | null = null;
    if (payload.started_at !== null) {
      const time = instantHourMinute(
        Date.parse(payload.started_at),
        payload.timezone
      );
      entryTime = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}:00`;
    }
    const entry = await client.query(
      `INSERT INTO exercise_entries (id, user_id, exercise_id, source_id, exercise_name,
         exercise_preset_entry_id, entry_date, entry_time, record_timezone, duration_minutes,
         calories_burned, notes, sort_order, created_by_user_id, source, modality)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $2, 'opengym', $14)
       ON CONFLICT (id) DO UPDATE SET exercise_id = EXCLUDED.exercise_id, exercise_name = EXCLUDED.exercise_name,
         entry_date = EXCLUDED.entry_date, entry_time = EXCLUDED.entry_time, record_timezone = EXCLUDED.record_timezone,
         duration_minutes = EXCLUDED.duration_minutes, calories_burned = EXCLUDED.calories_burned,
         notes = EXCLUDED.notes, sort_order = EXCLUDED.sort_order, modality = EXCLUDED.modality, updated_at = now()
       WHERE exercise_entries.user_id = $2 AND exercise_entries.source = 'opengym' AND exercise_entries.source_id = $4`,
      [
        entryId,
        ownerId,
        exerciseId,
        sourceId(
          peerOwnerRef,
          'workout_instance',
          payload.workout_id,
          exercise.instance_id
        ),
        exercise.name,
        parentId,
        payload.date,
        entryTime,
        payload.timezone,
        0,
        0,
        flags.join(' '),
        exercise.position,
        modality,
      ]
    );
    if (entry.rowCount !== 1)
      throw new Error('sparkygym_native_identity_conflict');
    const setSourceIds: string[] = [];
    for (const set of exercise.sets) {
      const setSourceId = sourceId(
        peerOwnerRef,
        'workout_set',
        payload.workout_id,
        exercise.instance_id,
        set.set_id
      );
      setSourceIds.push(setSourceId);
      const weightKnown = set.load_mode === 'total';
      const setFlags = ['sparkygym_source_owned'];
      if (!weightKnown) setFlags.push('sparkygym_unmapped_load_mode');
      if (!set.completed) setFlags.push('sparkygym_incomplete_set');
      await client.query(
        `INSERT INTO exercise_entry_sets (exercise_entry_id, source_id, source_owner_id, set_number, set_type,
           reps, weight, duration, distance, rpe, rir, completed_at, notes, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'opengym')
         ON CONFLICT (exercise_entry_id, source_id) WHERE source = 'opengym' DO UPDATE SET
           set_number = EXCLUDED.set_number, set_type = EXCLUDED.set_type, reps = EXCLUDED.reps,
           weight = EXCLUDED.weight, duration = EXCLUDED.duration, distance = EXCLUDED.distance,
           rpe = EXCLUDED.rpe, rir = EXCLUDED.rir, completed_at = EXCLUDED.completed_at,
           notes = EXCLUDED.notes, updated_at = now()`,
        [
          entryId,
          setSourceId,
          ownerId,
          set.position + 1,
          set.kind,
          set.completed ? set.reps : null,
          set.completed && weightKnown ? set.weight_kg : null,
          set.completed ? set.duration_seconds : null,
          !set.completed || set.distance_meters === null
            ? null
            : set.distance_meters / 1000,
          set.rpe,
          set.rir,
          set.completed ? payload.ended_at : null,
          setFlags.join(' '),
        ]
      );
    }
    await client.query(
      `DELETE FROM exercise_entry_sets WHERE exercise_entry_id = $1 AND source = 'opengym'
         AND source_owner_id = $2 AND NOT (source_id = ANY($3::text[]))`,
      [entryId, ownerId, setSourceIds]
    );
    await client.query(
      `DELETE FROM exercise_entry_activity_details WHERE exercise_entry_id = $1
         AND provider_name = 'opengym' AND detail_type = 'sparkygym_workout_v1'`,
      [entryId]
    );
    await client.query(
      `INSERT INTO exercise_entry_activity_details (exercise_entry_id, provider_name, detail_type, detail_data, created_by_user_id, updated_by_user_id)
       VALUES ($1, 'opengym', 'sparkygym_workout_v1', $2::jsonb, $3, $3)`,
      [
        entryId,
        JSON.stringify({
          version: 1,
          peer_owner_ref: peerOwnerRef,
          instance_id: exercise.instance_id,
          workout: payload,
        }),
        ownerId,
      ]
    );
  }
  await client.query(
    `DELETE FROM exercise_entries WHERE user_id = $1 AND exercise_preset_entry_id = $2
       AND source = 'opengym' AND NOT (id = ANY($3::uuid[]))`,
    [ownerId, parentId, entryIds]
  );
  const ready = await client.query<{ id: string }>(
    `SELECT m.id FROM sparkygym_media m JOIN sparkygym_entities e ON e.local_id = m.id::text AND e.user_id = m.user_id
     WHERE e.user_id = $1 AND e.peer_ref = $2 AND e.resource = 'personal_media' AND NOT e.tombstone
       AND e.raw_payload->>'workout_id' = $3 AND e.raw_payload->>'kind' = 'workout'
       AND m.status = 'ready' AND m.mime LIKE 'image/%'`,
    [ownerId, peerOwnerRef, payload.workout_id]
  );
  for (const media of ready.rows)
    await linkReadyMedia(client, ownerId, media.id);
  return parentId;
}

async function applyPersonalMedia(
  client: PoolClient,
  ownerId: string,
  payload: SparkyGymPersonalMediaPayload
): Promise<{ id: string; status: string }> {
  const result = await client.query<{ id: string; status: string }>(
    `INSERT INTO sparkygym_media (id, user_id, sha256, bytes, mime, metadata, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'pending')
     ON CONFLICT (user_id, sha256) DO UPDATE SET updated_at = now(),
       status = CASE WHEN sparkygym_media.status = 'detached' THEN 'pending' ELSE sparkygym_media.status END
     WHERE sparkygym_media.bytes = EXCLUDED.bytes AND sparkygym_media.mime = EXCLUDED.mime
     RETURNING id, status`,
    [
      nativeId(ownerId, 'opengym-media', 'sha256', payload.sha256),
      ownerId,
      payload.sha256,
      payload.bytes,
      payload.mime,
      JSON.stringify({ version: 1 }),
    ]
  );
  const media = result.rows[0];
  if (!media) throw new Error('sparkygym_media_hash_metadata_mismatch');
  return media;
}

// This authenticated route must be served by the owning app, never by a public
// uploads directory. Only the transport layer reads the private archive path.
function mediaRoute(id: string): string {
  return `/api/integrations/sparkygym/media/${encodeURIComponent(id)}`;
}
async function linkReadyMedia(
  client: PoolClient,
  ownerId: string,
  mediaId: string,
  exclude?: { peer_ref: string; entity_id: string }
): Promise<void> {
  const attachments = await client.query<{
    peer_ref: string;
    workout_id: string;
  }>(
    `SELECT e.peer_ref, e.raw_payload->>'workout_id' AS workout_id
     FROM sparkygym_entities e JOIN sparkygym_media m ON m.id::text = e.local_id AND m.user_id = e.user_id
     WHERE e.user_id = $1 AND e.local_id = $2 AND e.resource = 'personal_media' AND NOT e.tombstone
       AND e.raw_payload->>'kind' = 'workout' AND e.raw_payload->>'workout_id' IS NOT NULL
       AND m.status = 'ready' AND m.mime LIKE 'image/%'
       AND ($3::text IS NULL OR NOT (e.peer_ref = $3 AND e.entity_id = $4))`,
    [ownerId, mediaId, exclude?.peer_ref ?? null, exclude?.entity_id ?? null]
  );
  for (const attachment of attachments.rows) {
    await linkMediaToWorkout(
      client,
      ownerId,
      attachment.peer_ref,
      attachment.workout_id,
      mediaId
    );
  }
}
async function linkMediaToWorkout(
  client: PoolClient,
  ownerId: string,
  peerRef: string,
  workoutId: string,
  mediaId: string
): Promise<void> {
  await client.query(
    `UPDATE exercise_entries SET image_url = $3, updated_at = now()
       WHERE user_id = $1 AND source = 'opengym' AND exercise_preset_entry_id = $2
         AND (image_url IS NULL OR image_url = $3)
         AND id = (SELECT id FROM exercise_entries WHERE user_id = $1 AND source = 'opengym'
           AND exercise_preset_entry_id = $2 ORDER BY sort_order, id LIMIT 1)`,
    [
      ownerId,
      nativeId(ownerId, peerRef, 'workout', workoutId),
      mediaRoute(mediaId),
    ]
  );
}

export interface VerifiedSparkyGymMedia {
  sha256: string;
  bytes: number;
  mime: string;
  private_path: string;
}
// Call only after authenticated exact-frame hash, magic/MIME and durable file
// persistence checks. Metadata acceptance alone must never mark bytes ready.
export async function markSparkyGymMediaReady(
  client: PoolClient,
  ownerId: string,
  mediaId: string,
  verified: VerifiedSparkyGymMedia
): Promise<void> {
  if (
    !isAbsolute(verified.private_path) ||
    verified.private_path.includes('\0') ||
    verified.private_path.length > 4096 ||
    !/^[a-f0-9]{64}$/.test(verified.sha256) ||
    !Number.isSafeInteger(verified.bytes) ||
    verified.bytes <= 0 ||
    verified.bytes > 104857600
  ) {
    throw new Error('sparkygym_media_verification_mismatch');
  }
  await importing(client, async () => {
    const result = await client.query<{ id: string }>(
      `UPDATE sparkygym_media SET status = 'ready', private_path = $3, last_error = NULL, updated_at = now()
       WHERE user_id = $1 AND id = $2 AND sha256 = $4 AND bytes = $5 AND mime = $6 AND status <> 'detached'
       RETURNING id`,
      [
        ownerId,
        mediaId,
        verified.private_path,
        verified.sha256,
        verified.bytes,
        verified.mime,
      ]
    );
    if (result.rows.length !== 1)
      throw new Error('sparkygym_media_verification_mismatch');
    await linkReadyMedia(client, ownerId, mediaId);
    await client.query(
      `INSERT INTO sparkygym_notifications (user_id, resource, payload) VALUES ($1, 'personal_media', $2::jsonb)
`,
      [ownerId, JSON.stringify({ media_id: mediaId, status: 'ready' })]
    );
  });
}

const healthConnectMetadata = z.object({
  metadata: z.object({
    dataOrigin: z.string().min(1).max(300),
    clientRecordId: z.string().min(1).max(300),
  }),
});
export function extractSparkyGymHealthConnectLineage(
  raw: unknown
): { provider: string; external_id: string } | null {
  const result = healthConnectMetadata.safeParse(raw);
  return result.success
    ? {
        provider: result.data.metadata.dataOrigin,
        external_id: result.data.metadata.clientRecordId,
      }
    : null;
}
export async function findSparkyGymHealthConnectCanonical(
  client: PoolClient,
  ownerId: string,
  raw: unknown
): Promise<string | null> {
  const lineage = extractSparkyGymHealthConnectLineage(raw);
  if (!lineage) return null;
  const result = await client.query<{ local_id: string }>(
    `SELECT e.local_id FROM sparkygym_entities e JOIN exercise_preset_entries p
       ON p.id::text = e.local_id AND p.user_id = e.user_id AND p.source = 'opengym'
     WHERE e.user_id = $1 AND e.resource = 'workout' AND NOT e.tombstone
       AND e.entity_id = e.raw_payload->>'workout_id'
       AND e.raw_payload->'source_snapshot'->'health_connect_lineage'->>'provider' = $2
       AND e.raw_payload->'source_snapshot'->'health_connect_lineage'->>'external_id' = $3
     LIMIT 2`,
    [ownerId, lineage.provider, lineage.external_id]
  );
  return result.rows.length === 1 ? result.rows[0]!.local_id : null;
}

export async function applySparkyGymProjection(
  client: PoolClient,
  ownerId: string,
  peerOwnerRef: string,
  input: SparkyGymDomainEvent
): Promise<void> {
  const event = sparkyGymDomainEventSchema.parse(input);
  if (event.producer !== 'opengym')
    throw new Error('sparkygym_projection_direction');
  if (!ownerId || !peerOwnerRef)
    throw new Error('sparkygym_projection_identity');
  if (event.operation === 'upsert') {
    const intrinsicId =
      event.resource === 'workout'
        ? event.payload.workout_id
        : event.resource === 'exercise'
          ? event.payload.exercise_id
          : event.payload.media_id;
    if (intrinsicId !== event.entity_id)
      throw new Error('sparkygym_projection_entity_mismatch');
    if (event.resource === 'workout') {
      const instanceIds = event.payload.exercises.map(
        (exercise) => exercise.instance_id
      );
      if (
        new Set(instanceIds).size !== instanceIds.length ||
        event.payload.exercises.some(
          (exercise) =>
            new Set(exercise.sets.map((set) => set.set_id)).size !==
            exercise.sets.length
        )
      ) {
        throw new Error('sparkygym_projection_duplicate_identity');
      }
    }
  }
  await importing(client, async () => {
    let localId: string | null = null;
    let readyMedia = false;
    const previousMedia =
      event.resource === 'personal_media'
        ? await client.query<{ local_id: string | null }>(
            `SELECT local_id FROM sparkygym_entities WHERE user_id = $1 AND peer_ref = $2 AND resource = 'personal_media' AND entity_id = $3
`,
            [ownerId, peerOwnerRef, event.entity_id]
          )
        : null;
    if (event.operation === 'delete') {
      const key = sourceId(peerOwnerRef, event.resource, event.entity_id);
      if (event.resource === 'workout')
        await client.query(
          `DELETE FROM exercise_preset_entries WHERE user_id = $1 AND source = 'opengym' AND source_id = $2
`,
          [ownerId, key]
        );
      else if (event.resource === 'exercise')
        await client.query(
          `DELETE FROM exercises WHERE user_id = $1 AND source = 'opengym' AND source_id = $2
`,
          [ownerId, key]
        );
    } else if (event.resource === 'exercise')
      localId = await applyExercise(
        client,
        ownerId,
        peerOwnerRef,
        event.payload,
        true
      );
    else if (event.resource === 'workout')
      localId = await applyWorkout(
        client,
        ownerId,
        peerOwnerRef,
        event.payload
      );
    else {
      const media = await applyPersonalMedia(client, ownerId, event.payload);
      localId = media.id;
      readyMedia = media.status === 'ready';
    }
    await client.query(
      `INSERT INTO sparkygym_entities (user_id, peer_ref, resource, entity_id, local_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, peer_ref, resource, entity_id) DO UPDATE SET
         local_id = COALESCE(EXCLUDED.local_id, sparkygym_entities.local_id)`,
      [ownerId, peerOwnerRef, event.resource, event.entity_id, localId]
    );
    if (event.resource === 'personal_media' && previousMedia) {
      for (const media of previousMedia.rows) {
        if (!media.local_id) continue;
        await client.query(
          `UPDATE exercise_entries SET image_url = NULL, updated_at = now()
          WHERE user_id = $1 AND source = 'opengym' AND source_id LIKE $2 AND image_url = $3`,
          [
            ownerId,
            `${sourcePrefix(peerOwnerRef)}%`,
            mediaRoute(media.local_id),
          ]
        );
        if (event.operation === 'delete' || media.local_id !== localId)
          await client.query(
            `UPDATE sparkygym_media m SET status = 'detached', updated_at = now()
          WHERE m.user_id = $1 AND m.id::text = $2 AND NOT EXISTS
            (SELECT 1 FROM sparkygym_entities e WHERE e.user_id = $1 AND e.resource = 'personal_media' AND e.local_id = $2 AND NOT e.tombstone
              AND NOT (e.peer_ref = $3 AND e.entity_id = $4))`,
            [ownerId, media.local_id, peerOwnerRef, event.entity_id]
          );
        await linkReadyMedia(client, ownerId, media.local_id, {
          peer_ref: peerOwnerRef,
          entity_id: event.entity_id,
        });
      }
    }
    if (
      readyMedia &&
      localId &&
      event.resource === 'personal_media' &&
      event.operation === 'upsert' &&
      event.payload.kind === 'workout' &&
      event.payload.workout_id &&
      event.payload.mime.startsWith('image/')
    ) {
      await linkMediaToWorkout(
        client,
        ownerId,
        peerOwnerRef,
        event.payload.workout_id,
        localId
      );
    }
  });
}

// Authorization, revoked-source confirmation and core media/entity cleanup belong
// to the caller. This operation never deletes manual, Hevy or wearable history.
export async function purgeSparkyGymProjections(
  client: PoolClient,
  ownerId: string,
  peerOwnerRef: string
): Promise<void> {
  await importing(client, async () => {
    const prefix = `${sourcePrefix(peerOwnerRef)}%`;
    await client.query(
      `DELETE FROM exercise_preset_entries WHERE user_id = $1 AND source = 'opengym' AND source_id LIKE $2
`,
      [ownerId, prefix]
    );
    await client.query(
      `DELETE FROM exercises WHERE user_id = $1 AND source = 'opengym' AND source_id LIKE $2
`,
      [ownerId, prefix]
    );
  });
}
