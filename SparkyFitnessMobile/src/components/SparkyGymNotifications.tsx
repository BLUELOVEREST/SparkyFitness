import { useEffect } from 'react';
import { AppState } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { useQueryClient } from '@tanstack/react-query';
import { useServerConfigs } from '../hooks/useServerConfigs';
import { useServerConnection } from '../hooks/useServerConnection';
import {
  getAuthHeaders,
  notifySessionExpired,
} from '../services/api/authService';
import { proxyHeadersToRecord } from '../services/storage';
import { normalizeUrl } from '../utils/serverUrl';
import { createNotificationDecoder } from '../utils/sparkyGymNotifications';
import { importedProgressPhotosRootKey } from '../services/api/importedProgressPhotosApi';

const roots = new Set([
  'exercises',
  'workoutLocations',
  'activeWorkoutPlan',
  'goalsRange',
  'goalPresets',
  'sparkyGym',
  'exerciseEntries',
  'exerciseHistory',
  'exerciseStats',
  'exerciseDetail',
  'exerciseSearch',
  'exercisesLibrary',
  'suggestedExercises',
  'workoutSession',
  'workoutPresets',
  'workoutPresetsLibrary',
  'workoutPlanTemplates',
  'dailySummary',
  'familyDailySummary',
  'dailyProgress',
  'reports',
  'exerciseDashboard',
  'trainingConsistency',
  'trainingLoad',
  'cardioSessions',
  'cardioSessionDetail',
  'personalRecords',
  'measurements',
  'measurementsRange',
  'measurementsLatestOnOrBefore',
  'customCategories',
  'customMeasurements',
  'customMeasurementsLatestManualOnOrBefore',
  'goals',
  'userProfile',
  'checkInPhotos',
  importedProgressPhotosRootKey[0],
]);

export default function SparkyGymNotifications() {
  const client = useQueryClient();
  const { activeConfig } = useServerConfigs();
  const { isConnected } = useServerConnection();
  useEffect(() => {
    if (!isConnected || !activeConfig || activeConfig.authType !== 'session')
      return;
    const baseUrl = normalizeUrl(activeConfig.url);
    if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) return;
    let stopped = false;
    let unauthorized = false;
    let cursor = '';
    const seen = new Set<string>();
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const invalidate = () =>
      void client.invalidateQueries({
        predicate: (query) => roots.has(String(query.queryKey[0])),
      });
    const connect = async () => {
      if (stopped || unauthorized || AppState.currentState !== 'active') return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const response = await expoFetch(
          `${baseUrl}/api/integrations/sparkygym/notifications`,
          {
            signal: current.signal,
            headers: {
              ...proxyHeadersToRecord(activeConfig.proxyHeaders),
              ...getAuthHeaders(activeConfig),
              Accept: 'text/event-stream',
              ...(cursor ? { 'Last-Event-ID': cursor } : {}),
            },
          }
        );
        if (response.status === 401 || response.status === 403) {
          unauthorized = true;
          if (response.status === 401) notifySessionExpired(activeConfig.id);
          return;
        }
        if (
          !response.ok ||
          !response.body ||
          !response.headers.get('content-type')?.includes('text/event-stream')
        )
          throw new Error('Notification stream unavailable');
        attempt = 0;
        const decoder = new TextDecoder();
        const frames = createNotificationDecoder((id, event) => {
          if (event === 'snapshot-required') {
            cursor = '';
            invalidate();
            return;
          }
          if (id && !seen.has(id)) {
            cursor = id;
            seen.add(id);
            if (seen.size > 1024) seen.delete(seen.values().next().value!);
            invalidate();
          }
        });
        const reader = response.body.getReader();
        try {
          while (!current.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            frames(decoder.decode(value, { stream: true }));
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } catch {
        // No payloads, credentials or invitation material go into diagnostics.
      } finally {
        if (
          !stopped &&
          !unauthorized &&
          !current.signal.aborted &&
          AppState.currentState === 'active'
        ) {
          retry = setTimeout(
            () => void connect(),
            Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5))
          );
        }
      }
    };
    const listener = AppState.addEventListener('change', (state) => {
      if (retry) clearTimeout(retry);
      controller?.abort();
      if (state === 'active') {
        invalidate();
        void connect();
      }
    });
    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (retry) clearTimeout(retry);
      listener.remove();
    };
  }, [activeConfig, isConnected, client]);
  return null;
}
