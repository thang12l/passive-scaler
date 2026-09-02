import type { App } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { appToScalingConfig, resolveHerokuApiKey } from "./app-config";
import { prisma } from "./db";
import { getWebDynoCount, scaleWebDynos } from "./heroku-client";
import { logger } from "./logger";
import { makeScalingDecision, type MetricsInput, type ScalingDecision } from "./scaling-engine";

export interface ProcessMetricsResult extends ScalingDecision {
  scalingEnabled: boolean;
  scaled: boolean;
}

async function ensureScalingState(app: App) {
  const existing = await prisma.scalingState.findUnique({ where: { appSlug: app.slug } });
  if (existing) return existing;

  let currentDynos = app.minDynos;
  const apiKey = resolveHerokuApiKey(app);
  if (apiKey && app.scalingEnabled) {
    try {
      currentDynos = await getWebDynoCount(app.appName, apiKey);
    } catch (error) {
      logger.warn("Could not fetch Heroku dyno count, using min_dynos", {
        appSlug: app.slug,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return prisma.scalingState.create({
    data: {
      appSlug: app.slug,
      currentDynos,
    },
  });
}

async function acquireScalingLock(appSlug: string): Promise<boolean> {
  const updated = await prisma.scalingState.updateMany({
    where: { appSlug, scalingInProgress: false },
    data: { scalingInProgress: true },
  });
  return updated.count === 1;
}

async function releaseScalingLock(appSlug: string): Promise<void> {
  await prisma.scalingState.update({
    where: { appSlug },
    data: { scalingInProgress: false },
  });
}

async function recordScalingAction(
  app: App,
  decision: ScalingDecision,
  metrics: MetricsInput,
  newQuantity: number,
  reason: string
): Promise<ProcessMetricsResult> {
  await prisma.scalingState.update({
    where: { appSlug: app.slug },
    data: {
      currentDynos: newQuantity,
      lastScaleTime: new Date(),
      lastAction: decision.action,
      scalingInProgress: false,
    },
  });

  await prisma.scalingEvent.create({
    data: {
      appSlug: app.slug,
      action: decision.action!,
      reason,
      metricsJson: metrics as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info("Scaling action completed", {
    appSlug: app.slug,
    action: decision.action,
    from: decision.currentDynos,
    to: newQuantity,
  });

  return {
    ...decision,
    currentDynos: newQuantity,
    targetDynos: newQuantity,
    reason,
    scalingEnabled: true,
    scaled: true,
  };
}

export async function getOrCreateState(app: App) {
  return ensureScalingState(app);
}

export async function processMetrics(app: App, metrics: MetricsInput): Promise<ProcessMetricsResult> {
  const scalingConfig = appToScalingConfig(app);
  const state = await ensureScalingState(app);

  await prisma.scalingState.update({
    where: { appSlug: app.slug },
    data: {
      lastResponseTime: new Prisma.Decimal(metrics.avgResponseTime),
      lastMemoryPercent: new Prisma.Decimal(metrics.memoryPercent),
    },
  });

  if (!app.scalingEnabled) {
    return {
      shouldScale: false,
      action: null,
      currentDynos: state.currentDynos ?? app.minDynos,
      targetDynos: state.currentDynos ?? app.minDynos,
      reason: "Scaling disabled — metrics recorded only",
      scalingEnabled: false,
      scaled: false,
    };
  }

  if (state.scalingInProgress) {
    return {
      shouldScale: false,
      action: null,
      currentDynos: state.currentDynos ?? app.minDynos,
      targetDynos: state.currentDynos ?? app.minDynos,
      reason: "Scaling already in progress",
      scalingEnabled: true,
      scaled: false,
    };
  }

  let currentDynos = state.currentDynos ?? app.minDynos;
  const apiKey = resolveHerokuApiKey(app);

  if (apiKey) {
    try {
      currentDynos = await getWebDynoCount(app.appName, apiKey);
    } catch (error) {
      logger.warn("Using cached dyno count", {
        appSlug: app.slug,
        cached: currentDynos,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  await prisma.scalingState.update({
    where: { appSlug: app.slug },
    data: { currentDynos },
  });

  const decision = makeScalingDecision(
    metrics,
    { currentDynos, lastScaleTime: state.lastScaleTime },
    scalingConfig
  );

  if (!decision.shouldScale || !decision.action) {
    return { ...decision, scalingEnabled: true, scaled: false };
  }

  const locked = await acquireScalingLock(app.slug);
  if (!locked) {
    return {
      shouldScale: false,
      action: null,
      currentDynos,
      targetDynos: currentDynos,
      reason: "Scaling already in progress",
      scalingEnabled: true,
      scaled: false,
    };
  }

  if (!apiKey) {
    await releaseScalingLock(app.slug);
    return {
      ...decision,
      shouldScale: false,
      action: null,
      reason: `${decision.reason} (Heroku API key not configured)`,
      scalingEnabled: true,
      scaled: false,
    };
  }

  try {
    const newQuantity = await scaleWebDynos(app.appName, apiKey, decision.targetDynos);
    return recordScalingAction(app, decision, metrics, newQuantity, decision.reason);
  } catch (error) {
    await releaseScalingLock(app.slug);
    throw error;
  }
}

export async function getAppStatus(appSlug: string) {
  return prisma.scalingState.findUnique({
    where: { appSlug },
    include: {
      app: {
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      },
    },
  });
}
