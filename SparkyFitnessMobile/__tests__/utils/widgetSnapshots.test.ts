import { buildHydrationWidgetSnapshot } from '../../src/utils/widgetSnapshots';

describe('widgetSnapshots', () => {
  describe('buildHydrationWidgetSnapshot', () => {
    it('builds a serializable hydration snapshot with fixed quick actions', () => {
      const snapshot = buildHydrationWidgetSnapshot({
        date: '2026-08-12',
        consumedMl: 1600,
        goalMl: 2500,
        lastUpdated: 1786500000,
        actionConfig: {
          baseUrl: 'https://health.example.com',
          authHeader: 'Bearer token',
          proxyHeaders: { 'X-Proxy-User': 'eric' },
        },
      });

      expect(snapshot).toEqual({
        date: '2026-08-12',
        consumedMl: 1600,
        goalMl: 2500,
        progress: 0.64,
        consumedText: '1.6 L',
        goalText: '2.5 L',
        quickAddMl: [250, 350, 500],
        decrementMl: 250,
        lastUpdated: 1786500000,
        status: 'ok',
        actionConfig: {
          baseUrl: 'https://health.example.com',
          authHeader: 'Bearer token',
          proxyHeaders: { 'X-Proxy-User': 'eric' },
        },
      });
    });

    it('clamps progress and consumed water to display-safe values', () => {
      expect(
        buildHydrationWidgetSnapshot({
          date: '2026-08-12',
          consumedMl: -100,
          goalMl: 0,
          lastUpdated: 1786500000,
          actionConfig: null,
        })
      ).toMatchObject({
        consumedMl: 0,
        goalMl: 0,
        progress: 0,
        consumedText: '0 ml',
        goalText: '0 ml',
      });

      expect(
        buildHydrationWidgetSnapshot({
          date: '2026-08-12',
          consumedMl: 3200,
          goalMl: 2500,
          lastUpdated: 1786500000,
          actionConfig: null,
        }).progress
      ).toBe(1);
    });
  });
});
