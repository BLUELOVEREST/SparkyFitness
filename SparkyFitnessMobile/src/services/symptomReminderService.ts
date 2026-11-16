import * as Notifications from 'expo-notifications';
import { addLog } from './LogService';
import {
  ensureSymptomReminderChannel,
  hasNotificationPermission,
  notificationCopy,
} from './notifications';

const SYMPTOM_REMINDER_CHANNEL_ID = 'symptom-reminders';
const SYMPTOM_EPISODE_NUDGE_CATEGORY = 'symptom-episode-nudge';

const SYMPTOM_ACTION_END_EPISODE = 'symptom-end-episode';
const SYMPTOM_ACTION_STILL_ONGOING = 'symptom-still-ongoing';

const ONGOING_NUDGE_PREFIX = 'symptom_nudge_';

export async function ensureSymptomNotificationCategory(): Promise<void> {
  try {
    await ensureSymptomReminderChannel();
    await Notifications.setNotificationCategoryAsync(
      SYMPTOM_EPISODE_NUDGE_CATEGORY,
      [
        {
          identifier: SYMPTOM_ACTION_END_EPISODE,
          buttonTitle: notificationCopy('symptoms.actions.endNow', 'End now'),
          options: { isDestructive: false },
        },
        {
          identifier: SYMPTOM_ACTION_STILL_ONGOING,
          buttonTitle: notificationCopy(
            'symptoms.actions.stillOngoing',
            'Still ongoing'
          ),
          options: { isDestructive: false },
        },
      ]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addLog(`ensureSymptomNotificationCategory failed: ${message}`, 'ERROR');
  }
}

export async function scheduleOngoingEpisodeNudge(
  episodeId: string,
  symptomName: string,
  startedAt: string,
  nudgeHours = 24
): Promise<void> {
  const notifId = `${ONGOING_NUDGE_PREFIX}${episodeId}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
    if (!(await hasNotificationPermission())) return;

    const startTime = new Date(startedAt).getTime();
    const triggerTime = startTime + nudgeHours * 60 * 60 * 1000;
    const now = Date.now();
    if (triggerTime <= now) return;

    await Notifications.scheduleNotificationAsync({
      identifier: notifId,
      content: {
        title: notificationCopy(
          'symptoms.notification.nudgeTitle',
          'Episode still active?'
        ),
        body: notificationCopy(
          'symptoms.notification.nudgeBody',
          '{{name}} has been running for {{hours}} hours. Is it still ongoing or ended?',
          { name: symptomName, hours: nudgeHours }
        ),
        sound: true,
        categoryIdentifier: SYMPTOM_EPISODE_NUDGE_CATEGORY,
        data: { episodeId, symptomName },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerTime),
        channelId: SYMPTOM_REMINDER_CHANNEL_ID,
      },
    });
  } catch (err) {
    addLog(
      `scheduleOngoingEpisodeNudge failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

export async function cancelOngoingEpisodeNudge(
  episodeId: string
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(
      `${ONGOING_NUDGE_PREFIX}${episodeId}`
    );
  } catch {
    // ignore
  }
}
