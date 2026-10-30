import type { TFunction } from 'i18next';

export function sparkyGymCopy(t: TFunction) {
  return {
    body_definition: t('sparkyGym.body_definition', {
      defaultValue: 'Body definitions',
    }),
    body_measurement: t('sparkyGym.body_measurement', {
      defaultValue: 'Body measurements',
    }),
    body_goal: t('sparkyGym.body_goal', { defaultValue: 'Target weight' }),
    exercise: t('sparkyGym.exercise', { defaultValue: 'Exercises' }),
    workout: t('sparkyGym.workout', { defaultValue: 'Workouts' }),
    schedule_summary: t('sparkyGym.schedule_summary', {
      defaultValue: 'Schedule',
    }),
    personal_media: t('sparkyGym.personal_media', {
      defaultValue: 'Personal photos',
    }),
    invited: t('sparkyGym.invited', { defaultValue: 'Invited' }),
    pending_approval: t('sparkyGym.pending_approval', {
      defaultValue: 'Awaiting owner approval',
    }),
    active: t('sparkyGym.active', { defaultValue: 'Active' }),
    paused: t('sparkyGym.paused', { defaultValue: 'Paused' }),
    revoked: t('sparkyGym.revoked', { defaultValue: 'Revoked' }),
    expired: t('sparkyGym.expired', { defaultValue: 'Expired' }),
    approve: t('sparkyGym.approve', { defaultValue: 'Approve owner' }),
    pause: t('sparkyGym.pause', { defaultValue: 'Pause' }),
    resume: t('sparkyGym.resume', { defaultValue: 'Resume' }),
    revoke: t('sparkyGym.revoke', { defaultValue: 'Revoke' }),
    snapshot: t('sparkyGym.snapshot', { defaultValue: 'Import snapshot' }),
    purge: t('sparkyGym.purge', { defaultValue: 'Purge imported records' }),
  };
}
