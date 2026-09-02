import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { getConfig } from "./config";
import { getWebDynoCount, scaleWebDynos } from "./heroku-client";
import { logger } from "./logger";
import { makeScalingDecision, type MetricsInput, type ScalingDecision } from "./scaling-engine";

export async function getOrCreateState(appName: string) {
  const existing = await prisma.scalingState.findUnique({ where: { appName } });
  if (existing) return existing;

  let currentDynos = getConfig().MIN_DYNOS;
  try {
    currentDynos = await getWebDynoCount(appName);
  } catch (error) {
    logger.warn("Could not fetch Heroku dyno count, using MIN_DYNOS", {
      appName,
      error: error instanceof Error ? error.message : "unknown",
    });
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

export async function processMetrics(appName: string, metrics: MetricsInput): Promise<ScalingDecision> {
  const config = getConfig();
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
    };
  }

  let currentDynos = state.currentDynos ?? config.MIN_DYNOS;
  try {
    currentDynos = await getWebDynoCount(appName);
  } catch (error) {
    logger.warn("Using cached dyno count", {
      appName,
      cached: currentDynos,
      error: error instanceof Error ? error.message : "unknown",
    });
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
    return decision;
  }

  const locked = await acquireScalingLock(appName);
  if (!locked) {
    return {
      shouldScale: false,
      action: null,
      currentDynos,
      targetDynos: currentDynos,
      reason: "Scaling already in progress",
    };
  }

  try {
    const newQuantity = await scaleWebDynos(decision.targetDynos, appName);

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
        action: decision.action,
        reason: decision.reason,
        metricsJson: metrics as unknown as Prisma.InputJsonValue,
      },
    });

    logger.info("Scaling action completed", {
      appName,
      action: decision.action,
      from: decision.currentDynos,
      to: newQuantity,
    });

    return { ...decision, currentDynos: newQuantity, targetDynos: newQuantity };
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
