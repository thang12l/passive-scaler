import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getConfig, isHerokuConfigured } from "./config";
import { getWebDynoCount, scaleWebDynos } from "./heroku-client";
import { logger } from "./logger";
import { makeScalingDecision, type MetricsInput, type ScalingDecision } from "./scaling-engine";

const DRY_RUN_SUFFIX = " (dry-run: Heroku API key not configured)";

export interface ProcessMetricsResult extends ScalingDecision {
  dryRun: boolean;
}

export async function getOrCreateState(appName: string) {
  const existing = await prisma.scalingState.findUnique({ where: { appName } });
  if (existing) return existing;

  let currentDynos = getConfig().MIN_DYNOS;
  const herokuCount = await getWebDynoCount(appName);
  if (herokuCount !== null) {
    currentDynos = herokuCount;
  } else if (!isHerokuConfigured()) {
    logger.info("Heroku API key not configured, using MIN_DYNOS for state", { appName });
  } else {
    logger.warn("Could not fetch Heroku dyno count, using MIN_DYNOS", { appName });
  }

  return prisma.scalingState.create({
    data: {
      appName,
      currentDynos,
      lastAction: null,
      lastScaleTime: null,
    },
  });
}

async function acquireScalingLock(appName: string): Promise<boolean> {
  const updated = await prisma.scalingState.updateMany({
    where: { appName, scalingInProgress: false },
    data: { scalingInProgress: true },
  });
  return updated.count === 1;
}

async function releaseScalingLock(appName: string): Promise<void> {
  await prisma.scalingState.update({
    where: { appName },
    data: { scalingInProgress: false },
  });
}

async function recordScalingAction(
  appName: string,
  decision: ScalingDecision,
  metrics: MetricsInput,
  newQuantity: number,
  reason: string,
  dryRun: boolean
): Promise<ProcessMetricsResult> {
  await prisma.scalingState.update({
    where: { appName },
    data: {
      currentDynos: newQuantity,
      lastScaleTime: new Date(),
      lastAction: decision.action,
      scalingInProgress: false,
    },
  });

  await prisma.scalingEvent.create({
    data: {
      appName,
      action: decision.action!,
      reason,
      metricsJson: { ...metrics, dry_run: dryRun } as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info(dryRun ? "Dry-run scaling action recorded" : "Scaling action completed", {
    appName,
    action: decision.action,
    from: decision.currentDynos,
    to: newQuantity,
    dryRun,
  });

  return {
    ...decision,
    currentDynos: newQuantity,
    targetDynos: newQuantity,
    reason,
    dryRun,
  };
}

export async function processMetrics(
  appName: string,
  metrics: MetricsInput
): Promise<ProcessMetricsResult> {
  const config = getConfig();
  const herokuEnabled = isHerokuConfigured();
  const state = await prisma.scalingState.findUnique({ where: { appName } });

  if (!state) {
    throw new Error(`Scaling state not found for ${appName}`);
  }

  if (state.scalingInProgress) {
    return {
      shouldScale: false,
      action: null,
      currentDynos: state.currentDynos ?? config.MIN_DYNOS,
      targetDynos: state.currentDynos ?? config.MIN_DYNOS,
      reason: "Scaling already in progress",
      dryRun: !herokuEnabled,
    };
  }

  let currentDynos = state.currentDynos ?? config.MIN_DYNOS;
  const herokuCount = await getWebDynoCount(appName);
  if (herokuCount !== null) {
    currentDynos = herokuCount;
  } else if (herokuEnabled) {
    logger.warn("Using cached dyno count", { appName, cached: currentDynos });
  }

  const decision = makeScalingDecision(
    metrics,
    { currentDynos, lastScaleTime: state.lastScaleTime },
    config
  );

  await prisma.scalingState.update({
    where: { appName },
    data: {
      lastResponseTime: new Prisma.Decimal(metrics.avgResponseTime),
      lastMemoryPercent: new Prisma.Decimal(metrics.memoryPercent),
      currentDynos,
    },
  });

  if (!decision.shouldScale || !decision.action) {
    return { ...decision, dryRun: !herokuEnabled };
  }

  const locked = await acquireScalingLock(appName);
  if (!locked) {
    return {
      shouldScale: false,
      action: null,
      currentDynos,
      targetDynos: currentDynos,
      reason: "Scaling already in progress",
      dryRun: !herokuEnabled,
    };
  }

  if (!herokuEnabled) {
    const reason = `${decision.reason}${DRY_RUN_SUFFIX}`;
    return recordScalingAction(appName, decision, metrics, decision.targetDynos, reason, true);
  }

  try {
    const newQuantity = await scaleWebDynos(decision.targetDynos, appName);
    if (newQuantity === null) {
      const reason = `${decision.reason}${DRY_RUN_SUFFIX}`;
      return recordScalingAction(appName, decision, metrics, decision.targetDynos, reason, true);
    }

    return recordScalingAction(appName, decision, metrics, newQuantity, decision.reason, false);
  } catch (error) {
    await releaseScalingLock(appName);
    throw error;
  }
}

export async function getStatus(appName: string) {
  return prisma.scalingState.findUnique({
    where: { appName },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
}
