import type { App } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  SCALING_EXECUTION_STATUS,
  appToWebScalingConfig,
  appToWorkerScalingConfig,
  resolveHerokuApiKey,
  type ScalingExecutionStatus,
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
  executionStatus: ScalingExecutionStatus | null;
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

async function recordScalingDecision(
  app: App,
  processType: ProcessType,
  decision: ScalingDecision,
  metrics: MetricsInput,
  outcome: {
    status: ScalingExecutionStatus;
    error?: string | null;
    resultingDynos?: number | null;
  }
): Promise<ProcessMetricsResult> {
  const succeeded = outcome.status === SCALING_EXECUTION_STATUS.SUCCEEDED;
  const resultingDynos = outcome.resultingDynos ?? null;
  const reason = outcome.error ? `${decision.reason} (${outcome.error})` : decision.reason;

  await prisma.formationState.update({
    where: { appSlug_processType: { appSlug: app.slug, processType } },
    data: {
      lastScaleTime: new Date(),
      ...(succeeded
        ? { currentDynos: resultingDynos!, lastAction: decision.action }
        : resultingDynos != null
          ? { currentDynos: resultingDynos }
          : {}),
    },
  });

  await prisma.scalingEvent.create({
    data: {
      appSlug: app.slug,
      processType,
      action: decision.action!,
      reason: decision.reason,
      metricsJson: { ...metrics, scaled: succeeded } as unknown as Prisma.InputJsonValue,
      executionStatus: outcome.status,
      executionError: outcome.error ?? null,
      targetDynos: decision.targetDynos,
      resultingDynos,
    },
  });

  logger.info("Scaling decision recorded", {
    appSlug: app.slug,
    processType,
    action: decision.action,
    from: decision.currentDynos,
    to: decision.targetDynos,
    executionStatus: outcome.status,
    resultingDynos,
  });

  return {
    ...decision,
    processType,
    currentDynos: succeeded && resultingDynos != null ? resultingDynos : decision.currentDynos,
    reason,
    scalingEnabled: true,
    scaled: succeeded,
    executionStatus: outcome.status,
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
      executionStatus: null,
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
      executionStatus: null,
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
    return { ...decision, processType, scalingEnabled: true, scaled: false, executionStatus: null };
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
      executionStatus: null,
    };
  }

  try {
    if (!apiKey) {
      return recordScalingDecision(app, processType, decision, metrics, {
        status: SCALING_EXECUTION_STATUS.NOT_EXECUTED,
        error: "Heroku API key not configured",
      });
    }

    try {
      const newQuantity = await scaleFormation(
        app.appName,
        apiKey,
        processType,
        decision.targetDynos
      );
      if (newQuantity !== decision.targetDynos) {
        return recordScalingDecision(app, processType, decision, metrics, {
          status: SCALING_EXECUTION_STATUS.FAILED,
          error: `Heroku formation quantity was ${newQuantity}, expected ${decision.targetDynos}`,
          resultingDynos: newQuantity,
        });
      }
      return recordScalingDecision(app, processType, decision, metrics, {
        status: SCALING_EXECUTION_STATUS.SUCCEEDED,
        resultingDynos: newQuantity,
      });
    } catch (error) {
      return recordScalingDecision(app, processType, decision, metrics, {
        status: SCALING_EXECUTION_STATUS.FAILED,
        error: error instanceof Error ? error.message : "Heroku API call failed",
      });
    }
  } finally {
    await releaseScalingLock(app.slug, processType);
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
