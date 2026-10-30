import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';

const roots = new Set([
  'sparkyGym',
  'exerciseEntries',
  'dailySummary',
  'dailyProgress',
  'exercises',
  'exerciseSearch',
  'workoutPresets',
  'workoutPlanTemplates',
  'reports',
  'diaryReports',
  'checkIn',
  'goals',
  'onboarding',
]);

export function useSparkyGymNotifications() {
  const { user } = useAuth();
  const { isActingOnBehalf } = useActiveUser();
  const client = useQueryClient();
  const owner = user && !user.isDemo && !isActingOnBehalf ? user.id : null;
  useEffect(() => {
    if (!owner || typeof EventSource === 'undefined') return;
    let cursor = '';
    const seen = new Set<string>();
    let stream: EventSource | undefined;
    const invalidate = () =>
      void client.invalidateQueries({
        predicate: (query) => roots.has(String(query.queryKey[0])),
      });
    const receive = (event: MessageEvent<string>) => {
      if (event.type === 'snapshot-required') {
        cursor = '';
        invalidate();
        return;
      }
      if (!event.lastEventId || seen.has(event.lastEventId)) return;
      cursor = event.lastEventId;
      seen.add(cursor);
      if (seen.size > 1024) seen.delete(seen.values().next().value!);
      invalidate();
    };
    const connect = () => {
      stream?.close();
      if (document.visibilityState === 'hidden') return;
      stream = new EventSource(
        `/api/integrations/sparkygym/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { withCredentials: true }
      );
      for (const type of [
        'message',
        'committed',
        'notification',
        'snapshot-required',
      ])
        stream.addEventListener(type, receive as EventListener);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') stream?.close();
      else {
        invalidate();
        connect();
      }
    };
    connect();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stream?.close();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [owner, client]);
}
