import type { App } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  appToWebScalingConfig,
  appToWorkerScalingConfig,
  resolveHerokuApiKey,
} from "./app-config";
import { prisma } from "./db";
import { getFormationCount, scaleFormation } from "./heroku-client";
import { logger } from "./logger";
import { isScalingEnabledForProcess, resolveProcessType, type ProcessType } from "./process-type";
import {
  makeWebScalingDecision,
  makeWorkerScalingDecision,
  type MetricsInput,
  type ScalingDecision,
} from "./scaling-engine";

export interface ProcessMetricsResult extends ScalingDecision {
  processType: ProcessType;
  scalingEnabled: boolean;
  scaled: boolean;
}

function minDynosForProcess(app: App, processType: ProcessType): number {
  return processType === "worker" ? app.workerMinDynos : app.minDynos;
}

function maxQueueLatency(metrics: MetricsInput): number {
  if (metrics.queueLatencies) {
    const values = Object.values(metrics.queueLatencies);
    if (values.length > 0) return Math.max(...values);
  }
  return metrics.avgResponseTime;
}

async function ensureFormationState(app: App, processType: ProcessType) {
  const existing = await prisma.formationState.findUnique({
    where: { appSlug_processType: { appSlug: app.slug, processType } },
  });
  if (existing) return existing;

  let currentDynos = minDynosForProcess(app, processType);
  const apiKey = resolveHerokuApiKey(app);
  const scalingEnabled = isScalingEnabledForProcess(app, processType);

  if (apiKey && scalingEnabled) {
    try {
      currentDynos = await getFormationCount(app.appName, apiKey, processType);
    } catch (error) {
      logger.warn("Could not fetch Heroku dyno count, using min_dynos", {
        appSlug: app.slug,
        processType,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return prisma.formationState.create({
    data: {
      appSlug: app.slug,
      processType,
      currentDynos,
    },
  });
}

async function acquireScalingLock(appSlug: string, processType: ProcessType): Promise<boolean> {
  const updated = await prisma.formationState.updateMany({
    where: { appSlug, processType, scalingInProgress: false },
    data: { scalingInProgress: true },
  });
  return updated.count === 1;
}

async function releaseScalingLock(appSlug: string, processType: ProcessType): Promise<void> {
  await prisma.formationState.update({
    where: { appSlug_processType: { appSlug, processType } },
    data: { scalingInProgress: false },
  });
}

function makeDecision(app: App, metrics: MetricsInput, state: { currentDynos: number | null; lastScaleTime: Date | null }, processType: ProcessType): ScalingDecision {
  const currentDynos = state.currentDynos ?? minDynosForProcess(app, processType);
  const stateInput = { currentDynos, lastScaleTime: state.lastScaleTime };

  if (processType === "worker") {
    return makeWorkerScalingDecision(metrics, stateInput, appToWorkerScalingConfig(app));
  }
  return makeWebScalingDecision(metrics, stateInput, appToWebScalingConfig(app));
}

async function recordScalingAction(
  app: App,
  processType: ProcessType,
  decision: ScalingDecision,
  metrics: MetricsInput,
  newQuantity: number,
  reason: string
): Promise<ProcessMetricsResult> {
  await prisma.formationState.update({
    where: { appSlug_processType: { appSlug: app.slug, processType } },
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
      processType,
      action: decision.action!,
      reason,
      metricsJson: { ...metrics, scaled: true } as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info("Scaling action completed", {
    appSlug: app.slug,
    processType,
    action: decision.action,
    from: decision.currentDynos,
    to: newQuantity,
  });

  return {
    ...decision,
    processType,
    currentDynos: newQuantity,
    targetDynos: newQuantity,
    reason,
    scalingEnabled: true,
    scaled: true,
  };
}

export async function getOrCreateFormationStates(app: App) {
  await Promise.all([
    ensureFormationState(app, "web"),
    ensureFormationState(app, "worker"),
  ]);
}

export async function processMetrics(app: App, metrics: MetricsInput): Promise<ProcessMetricsResult> {
  const processType = resolveProcessType(metrics.processType);
  const state = await ensureFormationState(app, processType);
  const queueLatency = maxQueueLatency(metrics);

  await prisma.formationState.update({
    where: { appSlug_processType: { appSlug: app.slug, processType } },
    data: {
      lastResponseTime: new Prisma.Decimal(metrics.avgResponseTime),
      lastMemoryPercent: new Prisma.Decimal(metrics.memoryPercent),
      lastQueueSize: metrics.queueSize ?? null,
      lastQueueLatency: new Prisma.Decimal(queueLatency),
    },
  });

  if (!isScalingEnabledForProcess(app, processType)) {
    return {
      shouldScale: false,
      action: null,
      processType,
      currentDynos: state.currentDynos ?? minDynosForProcess(app, processType),
      targetDynos: state.currentDynos ?? minDynosForProcess(app, processType),
      reason: `${processType} scaling disabled — metrics recorded only`,
      scalingEnabled: false,
      scaled: false,
    };
  }

  if (state.scalingInProgress) {
    return {
      shouldScale: false,
      action: null,
      processType,
      currentDynos: state.currentDynos ?? minDynosForProcess(app, processType),
      targetDynos: state.currentDynos ?? minDynosForProcess(app, processType),
      reason: "Scaling already in progress",
      scalingEnabled: true,
      scaled: false,
    };
  }

  let currentDynos = state.currentDynos ?? minDynosForProcess(app, processType);
  const apiKey = resolveHerokuApiKey(app);

  if (apiKey) {
    try {
      currentDynos = await getFormationCount(app.appName, apiKey, processType);
    } catch (error) {
      logger.warn("Using cached dyno count", {
        appSlug: app.slug,
        processType,
        cached: currentDynos,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  await prisma.formationState.update({
    where: { appSlug_processType: { appSlug: app.slug, processType } },
    data: { currentDynos },
  });

  const decision = makeDecision(app, metrics, { currentDynos, lastScaleTime: state.lastScaleTime }, processType);

  if (!decision.shouldScale || !decision.action) {
    return { ...decision, processType, scalingEnabled: true, scaled: false };
  }

  const locked = await acquireScalingLock(app.slug, processType);
  if (!locked) {
    return {
      shouldScale: false,
      action: null,
      processType,
      currentDynos,
      targetDynos: currentDynos,
      reason: "Scaling already in progress",
      scalingEnabled: true,
      scaled: false,
    };
  }

  if (!apiKey) {
    await releaseScalingLock(app.slug, processType);
    return {
      ...decision,
      processType,
      shouldScale: false,
      action: null,
      reason: `${decision.reason} (Heroku API key not configured)`,
      scalingEnabled: true,
      scaled: false,
    };
  }

  try {
    const newQuantity = await scaleFormation(app.appName, apiKey, processType, decision.targetDynos);
    return recordScalingAction(app, processType, decision, metrics, newQuantity, decision.reason);
  } catch (error) {
    await releaseScalingLock(app.slug, processType);
    throw error;
  }
}

export async function getAppFormations(appSlug: string) {
  return prisma.formationState.findMany({
    where: { appSlug },
    orderBy: { processType: "asc" },
  });
}

export async function listAppEvents(
  appSlug: string,
  options: { limit?: number; offset?: number; processType?: ProcessType } = {}
) {
  const limit = Math.min(options.limit ?? 50, 100);
  const offset = options.offset ?? 0;

  const where: Prisma.ScalingEventWhereInput = { appSlug };
  if (options.processType) where.processType = options.processType;

  const [events, total] = await Promise.all([
    prisma.scalingEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.scalingEvent.count({ where }),
  ]);

  return { events, total, limit, offset };
}

// Backward compat
export const getOrCreateState = getOrCreateFormationStates;
export const getAppStatus = getAppFormations;
