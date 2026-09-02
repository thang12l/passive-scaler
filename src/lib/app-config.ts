import type { App } from "@prisma/client";
import { getPlatformHerokuApiKey } from "./platform-config";
import type { ProcessType } from "./process-type";

export interface WebScalingConfig {
  MIN_DYNOS: number;
  MAX_DYNOS: number;
  RESPONSE_TIME_THRESHOLD_MS: number;
  MEMORY_THRESHOLD_PERCENT: number;
  SCALE_UP_COOLDOWN_SECONDS: number;
  SCALE_DOWN_COOLDOWN_SECONDS: number;
  scaleDownResponseTimeThresholdMs: number;
  scaleDownMemoryThresholdPercent: number;
}

export interface WorkerScalingConfig {
  MIN_DYNOS: number;
  MAX_DYNOS: number;
  JOBS_PER_DYNO: number;
  SCALE_UP_COOLDOWN_SECONDS: number;
  SCALE_DOWN_COOLDOWN_SECONDS: number;
}

const PLACEHOLDER_HEROKU_KEYS = new Set(["", "your-heroku-api-key", "changeme"]);

export function appToWebScalingConfig(app: App): WebScalingConfig {
  const responseTimeThresholdMs = app.responseTimeThresholdMs;
  const memoryThresholdPercent = Number(app.memoryThresholdPercent);

  return {
    MIN_DYNOS: app.minDynos,
    MAX_DYNOS: app.maxDynos,
    RESPONSE_TIME_THRESHOLD_MS: responseTimeThresholdMs,
    MEMORY_THRESHOLD_PERCENT: memoryThresholdPercent,
    SCALE_UP_COOLDOWN_SECONDS: app.scaleUpCooldownSeconds,
    SCALE_DOWN_COOLDOWN_SECONDS: app.scaleDownCooldownSeconds,
    scaleDownResponseTimeThresholdMs: responseTimeThresholdMs * 0.5,
    scaleDownMemoryThresholdPercent: memoryThresholdPercent * 0.5,
  };
}

export function appToWorkerScalingConfig(app: App): WorkerScalingConfig {
  return {
    MIN_DYNOS: app.workerMinDynos,
    MAX_DYNOS: app.workerMaxDynos,
    JOBS_PER_DYNO: Math.max(1, app.workerQueueSizeThreshold),
    SCALE_UP_COOLDOWN_SECONDS: app.workerScaleUpCooldownSeconds,
    SCALE_DOWN_COOLDOWN_SECONDS: app.workerScaleDownCooldownSeconds,
  };
}

export function resolveHerokuApiKey(app: App): string | null {
  const appKey = app.herokuApiKey?.trim();
  if (appKey && !PLACEHOLDER_HEROKU_KEYS.has(appKey)) return appKey;
  return getPlatformHerokuApiKey();
}

export function isLiveScalingForProcess(app: App, processType: ProcessType): boolean {
  const enabled =
    processType === "worker" ? app.workerScalingEnabled : app.scalingEnabled;
  return enabled && resolveHerokuApiKey(app) !== null;
}

export function isLiveScaling(app: App): boolean {
  return (
    isLiveScalingForProcess(app, "web") || isLiveScalingForProcess(app, "worker")
  );
}

export function getPublicAppConfig(app: App) {
  const web = appToWebScalingConfig(app);
  const worker = appToWorkerScalingConfig(app);

  return {
    scaling_enabled: app.scalingEnabled,
    worker_scaling_enabled: app.workerScalingEnabled,
    app_name: app.appName,
    live_scaling: isLiveScaling(app),
    web: {
      enabled: app.scalingEnabled,
      live: isLiveScalingForProcess(app, "web"),
      min_dynos: web.MIN_DYNOS,
      max_dynos: web.MAX_DYNOS,
      thresholds: {
        response_time_ms: web.RESPONSE_TIME_THRESHOLD_MS,
        memory_percent: web.MEMORY_THRESHOLD_PERCENT,
      },
      cooldowns: {
        scale_up_seconds: web.SCALE_UP_COOLDOWN_SECONDS,
        scale_down_seconds: web.SCALE_DOWN_COOLDOWN_SECONDS,
      },
    },
    worker: {
      enabled: app.workerScalingEnabled,
      live: isLiveScalingForProcess(app, "worker"),
      min_dynos: worker.MIN_DYNOS,
      max_dynos: worker.MAX_DYNOS,
      thresholds: {
        jobs_per_dyno: worker.JOBS_PER_DYNO,
        queue_size: worker.JOBS_PER_DYNO,
        queue_latency_ms: app.workerQueueLatencyThresholdMs,
        memory_percent: Number(app.workerMemoryThresholdPercent),
      },
      cooldowns: {
        scale_up_seconds: worker.SCALE_UP_COOLDOWN_SECONDS,
        scale_down_seconds: worker.SCALE_DOWN_COOLDOWN_SECONDS,
      },
    },
  };
}

export function serializeApp(app: App) {
  return {
    slug: app.slug,
    app_name: app.appName,
    display_name: app.displayName,
    scaling_enabled: app.scalingEnabled,
    min_dynos: app.minDynos,
    max_dynos: app.maxDynos,
    response_time_threshold_ms: app.responseTimeThresholdMs,
    memory_threshold_percent: Number(app.memoryThresholdPercent),
    scale_up_cooldown_seconds: app.scaleUpCooldownSeconds,
    scale_down_cooldown_seconds: app.scaleDownCooldownSeconds,
    worker_scaling_enabled: app.workerScalingEnabled,
    worker_min_dynos: app.workerMinDynos,
    worker_max_dynos: app.workerMaxDynos,
    worker_queue_size_threshold: app.workerQueueSizeThreshold,
    worker_queue_latency_threshold_ms: app.workerQueueLatencyThresholdMs,
    worker_memory_threshold_percent: Number(app.workerMemoryThresholdPercent),
    worker_scale_up_cooldown_seconds: app.workerScaleUpCooldownSeconds,
    worker_scale_down_cooldown_seconds: app.workerScaleDownCooldownSeconds,
    has_heroku_api_key: Boolean(app.herokuApiKey?.trim()) || Boolean(getPlatformHerokuApiKey()),
    live_scaling: isLiveScaling(app),
    created_at: app.createdAt.toISOString(),
    updated_at: app.updatedAt.toISOString(),
  };
}

export function serializeFormationState(formation: {
  processType: string;
  currentDynos: number | null;
  lastScaleTime: Date | null;
  lastAction: string | null;
  lastResponseTime: { toNumber?: () => number } | null;
  lastMemoryPercent: { toNumber?: () => number } | null;
  lastQueueSize: number | null;
  lastQueueLatency: { toNumber?: () => number } | null;
  updatedAt: Date;
}) {
  return {
    process_type: formation.processType,
    current_dynos: formation.currentDynos,
    last_scale_time: formation.lastScaleTime?.toISOString() ?? null,
    last_action: formation.lastAction,
    last_metrics: {
      response_time: formation.lastResponseTime ? Number(formation.lastResponseTime) : null,
      memory_percent: formation.lastMemoryPercent ? Number(formation.lastMemoryPercent) : null,
      queue_size: formation.lastQueueSize,
      queue_latency: formation.lastQueueLatency ? Number(formation.lastQueueLatency) : null,
    },
    last_reported_at: formation.updatedAt.toISOString(),
  };
}

export const SCALING_EXECUTION_STATUS = {
  NOT_EXECUTED: "not_executed",
  FAILED: "failed",
  SUCCEEDED: "succeeded",
} as const;

export type ScalingExecutionStatus =
  (typeof SCALING_EXECUTION_STATUS)[keyof typeof SCALING_EXECUTION_STATUS];

export function serializeScalingEvent(event: {
  id: number;
  processType: string;
  action: string;
  reason: string;
  metricsJson: unknown;
  executionStatus: string;
  executionError: string | null;
  targetDynos: number | null;
  resultingDynos: number | null;
  createdAt: Date;
}) {
  const metrics = event.metricsJson as Record<string, unknown> | null;
  return {
    id: event.id,
    process_type: event.processType,
    action: event.action,
    reason: event.reason,
    execution_status: event.executionStatus,
    execution_error: event.executionError,
    target_dynos: event.targetDynos,
    resulting_dynos: event.resultingDynos,
    created_at: event.createdAt.toISOString(),
    metrics: metrics
      ? {
          process_type: metrics.processType ?? event.processType,
          dyno: metrics.dyno ?? null,
          avg_response_time: metrics.avgResponseTime ?? null,
          memory_percent: metrics.memoryPercent ?? null,
          queue_size: metrics.queueSize ?? null,
          scaled: metrics.scaled ?? null,
        }
      : null,
  };
}

// Backward compat alias
export const appToScalingConfig = appToWebScalingConfig;
export type ScalingConfig = WebScalingConfig;
