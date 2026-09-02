import type { AppConfig } from "./config";

export type ScalingAction = "scale_up" | "scale_down" | null;

export interface MetricsInput {
  avgResponseTime: number;
  memoryPercent: number;
}

export interface ScalingStateInput {
  currentDynos: number;
  lastScaleTime: Date | null;
}

export interface ScalingDecision {
  shouldScale: boolean;
  action: ScalingAction;
  currentDynos: number;
  targetDynos: number;
  reason: string;
}

function secondsSince(date: Date | null, now: Date): number {
  if (!date) return Number.POSITIVE_INFINITY;
  return (now.getTime() - date.getTime()) / 1000;
}

export function makeScalingDecision(
  metrics: MetricsInput,
  state: ScalingStateInput,
  config: AppConfig,
  now: Date = new Date()
): ScalingDecision {
  const { currentDynos, lastScaleTime } = state;
  const secondsSinceLastScale = secondsSince(lastScaleTime, now);

  const responseTimeHigh = metrics.avgResponseTime > config.RESPONSE_TIME_THRESHOLD_MS;
  const memoryHigh = metrics.memoryPercent > config.MEMORY_THRESHOLD_PERCENT;
  const responseTimeLow = metrics.avgResponseTime < config.scaleDownResponseTimeThresholdMs;
  const memoryLow = metrics.memoryPercent < config.scaleDownMemoryThresholdPercent;

  if (
    (responseTimeHigh || memoryHigh) &&
    currentDynos < config.MAX_DYNOS &&
    secondsSinceLastScale >= config.SCALE_UP_COOLDOWN_SECONDS
  ) {
    return {
      shouldScale: true,
      action: "scale_up",
      currentDynos,
      targetDynos: currentDynos + 1,
      reason: `Metrics exceed thresholds (response: ${metrics.avgResponseTime}ms, memory: ${metrics.memoryPercent}%)`,
    };
  }

  if (
    responseTimeLow &&
    memoryLow &&
    currentDynos > config.MIN_DYNOS &&
    secondsSinceLastScale >= config.SCALE_DOWN_COOLDOWN_SECONDS
  ) {
    return {
      shouldScale: true,
      action: "scale_down",
      currentDynos,
      targetDynos: currentDynos - 1,
      reason: `Metrics below scale-down thresholds (response: ${metrics.avgResponseTime}ms, memory: ${metrics.memoryPercent}%)`,
    };
  }

  if (responseTimeHigh || memoryHigh) {
    if (currentDynos >= config.MAX_DYNOS) {
      return {
        shouldScale: false,
        action: null,
        currentDynos,
        targetDynos: currentDynos,
        reason: "Metrics high but already at max dynos",
      };
    }
    if (secondsSinceLastScale < config.SCALE_UP_COOLDOWN_SECONDS) {
      return {
        shouldScale: false,
        action: null,
        currentDynos,
        targetDynos: currentDynos,
        reason: "Scale-up cooldown active",
      };
    }
  }

  if (responseTimeLow && memoryLow) {
    if (currentDynos <= config.MIN_DYNOS) {
      return {
        shouldScale: false,
        action: null,
        currentDynos,
        targetDynos: currentDynos,
        reason: "Metrics low but already at min dynos",
      };
    }
    if (secondsSinceLastScale < config.SCALE_DOWN_COOLDOWN_SECONDS) {
      return {
        shouldScale: false,
        action: null,
        currentDynos,
        targetDynos: currentDynos,
        reason: "Scale-down cooldown active",
      };
    }
  }

  return {
    shouldScale: false,
    action: null,
    currentDynos,
    targetDynos: currentDynos,
    reason: "Metrics are healthy",
  };
}
