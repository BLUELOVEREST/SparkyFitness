export interface HydrationWidgetActionConfig {
  baseUrl: string;
  authHeader: string;
  proxyHeaders: Record<string, string>;
}

export interface BuildHydrationWidgetSnapshotParams {
  date: string;
  consumedMl: number;
  goalMl: number;
  lastUpdated: number;
  actionConfig: HydrationWidgetActionConfig | null;
  status?: 'ok' | 'failed' | 'needsSetup';
}

export interface HydrationWidgetSnapshot {
  date: string;
  consumedMl: number;
  goalMl: number;
  progress: number;
  consumedText: string;
  goalText: string;
  quickAddMl: [250, 350, 500];
  decrementMl: 250;
  lastUpdated: number;
  status: 'ok' | 'failed' | 'needsSetup';
  actionConfig: HydrationWidgetActionConfig | null;
}

const QUICK_ADD_ML: [250, 350, 500] = [250, 350, 500];
const DECREMENT_ML = 250;

const clampNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const formatWater = (ml: number): string => {
  if (ml >= 1000) {
    const liters = ml / 1000;
    return `${Number.isInteger(liters) ? liters.toFixed(0) : liters.toFixed(1)} L`;
  }
  return `${Math.round(ml)} ml`;
};

export function buildHydrationWidgetSnapshot(
  params: BuildHydrationWidgetSnapshotParams,
): HydrationWidgetSnapshot {
  const consumedMl = Math.round(clampNonNegative(params.consumedMl));
  const goalMl = Math.round(clampNonNegative(params.goalMl));
  const progress =
    goalMl > 0 ? Math.max(0, Math.min(1, consumedMl / goalMl)) : 0;

  return {
    date: params.date,
    consumedMl,
    goalMl,
    progress,
    consumedText: formatWater(consumedMl),
    goalText: formatWater(goalMl),
    quickAddMl: QUICK_ADD_ML,
    decrementMl: DECREMENT_ML,
    lastUpdated: params.lastUpdated,
    status: params.status ?? (params.actionConfig ? 'ok' : 'needsSetup'),
    actionConfig: params.actionConfig,
  };
}
