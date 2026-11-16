import * as Notifications from 'expo-notifications';
import i18n from '../../src/localization/i18n';
import {
  ensureSymptomNotificationCategory,
  scheduleOngoingEpisodeNudge,
  cancelOngoingEpisodeNudge,
} from '../../src/services/symptomReminderService';

const mockGetPerms = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const mockSchedule =
  Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;
const mockCancel =
  Notifications.cancelScheduledNotificationAsync as jest.MockedFunction<
    typeof Notifications.cancelScheduledNotificationAsync
  >;
const mockSetCategory =
  Notifications.setNotificationCategoryAsync as jest.MockedFunction<
    typeof Notifications.setNotificationCategoryAsync
  >;

describe('symptomReminderService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPerms.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as never);
  });

  it('registers symptom notification category', async () => {
    await ensureSymptomNotificationCategory();
    expect(mockSetCategory).toHaveBeenCalledWith(
      'symptom-episode-nudge',
      expect.arrayContaining([
        expect.objectContaining({ identifier: 'symptom-end-episode' }),
        expect.objectContaining({ identifier: 'symptom-still-ongoing' }),
      ])
    );
  });

  it.each([undefined, null, ''])(
    'provides notification copy when translation returns %p',
    async (translation) => {
      jest.spyOn(i18n, 't').mockReturnValue(translation as never);
      await ensureSymptomNotificationCategory();
      expect(mockSetCategory).toHaveBeenCalledWith('symptom-episode-nudge', [
        expect.objectContaining({
          identifier: 'symptom-end-episode',
          buttonTitle: 'End now',
        }),
        expect.objectContaining({
          identifier: 'symptom-still-ongoing',
          buttonTitle: 'Still ongoing',
        }),
      ]);
      await scheduleOngoingEpisodeNudge(
        'ep-123',
        'Migraine',
        new Date().toISOString(),
        24
      );
      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            title: 'Episode still active?',
            body: 'Migraine has been running for 24 hours. Is it still ongoing or ended?',
          }),
        })
      );
    }
  );

  it('schedules ongoing episode nudge for future timestamp', async () => {
    const futureStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    await scheduleOngoingEpisodeNudge('ep-123', 'Migraine', futureStart, 24);

    expect(mockCancel).toHaveBeenCalledWith('symptom_nudge_ep-123');
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'symptom_nudge_ep-123',
        content: expect.objectContaining({
          categoryIdentifier: 'symptom-episode-nudge',
          data: { episodeId: 'ep-123', symptomName: 'Migraine' },
        }),
      })
    );
  });

  it('cancels ongoing episode nudge', async () => {
    await cancelOngoingEpisodeNudge('ep-123');
    expect(mockCancel).toHaveBeenCalledWith('symptom_nudge_ep-123');
  });
});
