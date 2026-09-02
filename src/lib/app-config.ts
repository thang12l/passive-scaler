import type { App } from "@prisma/client";
import { getPlatformHerokuApiKey } from "./platform-config";

export interface ScalingConfig {
  MIN_DYNOS: number;
  MAX_DYNOS: number;
  RESPONSE_TIME_THRESHOLD_MS: number;
  MEMORY_THRESHOLD_PERCENT: number;
  SCALE_UP_COOLDOWN_SECONDS: number;
  SCALE_DOWN_COOLDOWN_SECONDS: number;
  scaleDownResponseTimeThresholdMs: number;
  scaleDownMemoryThresholdPercent: number;
}

const PLACEHOLDER_HEROKU_KEYS = new Set(["", "your-heroku-api-key", "changeme"]);

export function appToScalingConfig(app: App): ScalingConfig {
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

export function resolveHerokuApiKey(app: App): string | null {
  const appKey = app.herokuApiKey?.trim();
  if (appKey && !PLACEHOLDER_HEROKU_KEYS.has(appKey)) return appKey;
  return getPlatformHerokuApiKey();
}

export function isLiveScaling(app: App): boolean {
  return app.scalingEnabled && !app.dryRun && resolveHerokuApiKey(app) !== null;
}

export function getPublicAppConfig(app: App) {
  const scaling = appToScalingConfig(app);
  return {
    scaling_enabled: app.scalingEnabled,
    dry_run: app.dryRun,
    heroku_app_name: app.herokuAppName,
    live_scaling: isLiveScaling(app),
    min_dynos: scaling.MIN_DYNOS,
    max_dynos: scaling.MAX_DYNOS,
    thresholds: {
      response_time_ms: scaling.RESPONSE_TIME_THRESHOLD_MS,
      memory_percent: scaling.MEMORY_THRESHOLD_PERCENT,
      scale_down_response_time_ms: scaling.scaleDownResponseTimeThresholdMs,
      scale_down_memory_percent: scaling.scaleDownMemoryThresholdPercent,
    },
    cooldowns: {
      scale_up_seconds: scaling.SCALE_UP_COOLDOWN_SECONDS,
      scale_down_seconds: scaling.SCALE_DOWN_COOLDOWN_SECONDS,
    },
  };
}

export function serializeApp(app: App) {
  return {
    slug: app.slug,
    display_name: app.displayName,
    heroku_app_name: app.herokuAppName,
    scaling_enabled: app.scalingEnabled,
    dry_run: app.dryRun,
    min_dynos: app.minDynos,
    max_dynos: app.maxDynos,
    response_time_threshold_ms: app.responseTimeThresholdMs,
    memory_threshold_percent: Number(app.memoryThresholdPercent),
    scale_up_cooldown_seconds: app.scaleUpCooldownSeconds,
    scale_down_cooldown_seconds: app.scaleDownCooldownSeconds,
    has_heroku_api_key: Boolean(app.herokuApiKey?.trim()),
    live_scaling: isLiveScaling(app),
    created_at: app.createdAt.toISOString(),
    updated_at: app.updatedAt.toISOString(),
  };
}
