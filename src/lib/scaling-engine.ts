import type { WebScalingConfig, WorkerScalingConfig } from "./app-config";

export type ScalingAction = "scale_up" | "scale_down" | null;

export interface MetricsInput {
  avgResponseTime: number;
  memoryPercent: number;
  processType?: string;
  dyno?: string;
  requestsPerMinute?: number;
  sampleCount?: number;
  queueSize?: number;
  queueDepths?: Record<string, number>;
  queueLatencies?: Record<string, number>;
  reportedAt?: string;
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

export function makeWebScalingDecision(
  metrics: MetricsInput,
  state: ScalingStateInput,
  config: WebScalingConfig,
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
      reason: `Web metrics exceed thresholds (response: ${metrics.avgResponseTime}ms, memory: ${metrics.memoryPercent}%)`,
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
      reason: `Web metrics below scale-down thresholds (response: ${metrics.avgResponseTime}ms, memory: ${metrics.memoryPercent}%)`,
    };
  }

  if (responseTimeHigh || memoryHigh) {
    if (currentDynos >= config.MAX_DYNOS) {
      return noScale(currentDynos, "Metrics high but already at max web dynos");
    }
    if (secondsSinceLastScale < config.SCALE_UP_COOLDOWN_SECONDS) {
      return noScale(currentDynos, "Web scale-up cooldown active");
    }
  }

  if (responseTimeLow && memoryLow) {
    if (currentDynos <= config.MIN_DYNOS) {
      return noScale(currentDynos, "Metrics low but already at min web dynos");
    }
    if (secondsSinceLastScale < config.SCALE_DOWN_COOLDOWN_SECONDS) {
      return noScale(currentDynos, "Web scale-down cooldown active");
    }
  }

  return noScale(currentDynos, "Web metrics are healthy");
}

export function makeWorkerScalingDecision(
  metrics: MetricsInput,
  state: ScalingStateInput,
  config: WorkerScalingConfig,
  now: Date = new Date()
): ScalingDecision {
  const { currentDynos, lastScaleTime } = state;
  const secondsSinceLastScale = secondsSince(lastScaleTime, now);
  const queueSize = metrics.queueSize ?? 0;
  const jobsPerDyno = Math.max(1, config.JOBS_PER_DYNO);
  const unboundedTarget = Math.ceil(queueSize / jobsPerDyno);
  const targetDynos = Math.min(
    config.MAX_DYNOS,
    Math.max(config.MIN_DYNOS, unboundedTarget)
  );

  if (targetDynos === currentDynos) {
    if (unboundedTarget > config.MAX_DYNOS) {
      return noScale(currentDynos, "Queue requires more workers but already at max worker dynos");
    }
    if (unboundedTarget < config.MIN_DYNOS) {
      return noScale(currentDynos, "Queue is small but already at min worker dynos");
    }
    return noScale(
      currentDynos,
      `Worker queue matches ${jobsPerDyno} jobs/dyno ratio (queue: ${queueSize})`
    );
  }

  if (targetDynos > currentDynos) {
    if (secondsSinceLastScale < config.SCALE_UP_COOLDOWN_SECONDS) {
      return noScale(currentDynos, "Worker scale-up cooldown active");
    }
    return {
      shouldScale: true,
      action: "scale_up",
      currentDynos,
      targetDynos,
      reason: `Worker queue ${queueSize} exceeds ${jobsPerDyno} jobs/dyno (target ${targetDynos})`,
    };
  }

  if (secondsSinceLastScale < config.SCALE_DOWN_COOLDOWN_SECONDS) {
    return noScale(currentDynos, "Worker scale-down cooldown active");
  }

  return {
    shouldScale: true,
    action: "scale_down",
    currentDynos,
    targetDynos,
    reason: `Worker queue ${queueSize} is below ${jobsPerDyno} jobs/dyno (target ${targetDynos})`,
  };
}

function noScale(currentDynos: number, reason: string): ScalingDecision {
  return {
    shouldScale: false,
    action: null,
    currentDynos,
    targetDynos: currentDynos,
    reason,
  };
}

// Backward compat
export const makeScalingDecision = makeWebScalingDecision;
