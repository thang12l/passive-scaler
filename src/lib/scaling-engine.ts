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

function maxQueueLatency(metrics: MetricsInput): number {
  if (metrics.queueLatencies) {
    const values = Object.values(metrics.queueLatencies);
    if (values.length > 0) return Math.max(...values);
  }
  return metrics.avgResponseTime;
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
  const queueLatency = maxQueueLatency(metrics);

  const queueHigh = queueSize > config.QUEUE_SIZE_THRESHOLD;
  const latencyHigh = queueLatency > config.QUEUE_LATENCY_THRESHOLD_MS;
  const memoryHigh = metrics.memoryPercent > config.MEMORY_THRESHOLD_PERCENT;
  const queueLow = queueSize < config.scaleDownQueueSizeThreshold;
  const latencyLow = queueLatency < config.scaleDownQueueLatencyThresholdMs;
  const memoryLow = metrics.memoryPercent < config.scaleDownMemoryThresholdPercent;

  if (
    (queueHigh || latencyHigh || memoryHigh) &&
    currentDynos < config.MAX_DYNOS &&
    secondsSinceLastScale >= config.SCALE_UP_COOLDOWN_SECONDS
  ) {
    return {
      shouldScale: true,
      action: "scale_up",
      currentDynos,
      targetDynos: currentDynos + 1,
      reason: `Worker metrics exceed thresholds (queue: ${queueSize}, latency: ${queueLatency}ms, memory: ${metrics.memoryPercent}%)`,
    };
  }

  if (
    queueLow &&
    latencyLow &&
    memoryLow &&
    currentDynos > config.MIN_DYNOS &&
    secondsSinceLastScale >= config.SCALE_DOWN_COOLDOWN_SECONDS
  ) {
    return {
      shouldScale: true,
      action: "scale_down",
      currentDynos,
      targetDynos: currentDynos - 1,
      reason: `Worker metrics below scale-down thresholds (queue: ${queueSize}, latency: ${queueLatency}ms, memory: ${metrics.memoryPercent}%)`,
    };
  }

  if (queueHigh || latencyHigh || memoryHigh) {
    if (currentDynos >= config.MAX_DYNOS) {
      return noScale(currentDynos, "Metrics high but already at max worker dynos");
    }
    if (secondsSinceLastScale < config.SCALE_UP_COOLDOWN_SECONDS) {
      return noScale(currentDynos, "Worker scale-up cooldown active");
    }
  }

  if (queueLow && latencyLow && memoryLow) {
    if (currentDynos <= config.MIN_DYNOS) {
      return noScale(currentDynos, "Metrics low but already at min worker dynos");
    }
    if (secondsSinceLastScale < config.SCALE_DOWN_COOLDOWN_SECONDS) {
      return noScale(currentDynos, "Worker scale-down cooldown active");
    }
  }

  return noScale(currentDynos, "Worker metrics are healthy");
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
