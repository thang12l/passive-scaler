import { randomBytes } from "crypto";
import { z } from "zod";
import type { App, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { generateWebhookSecret, hashSecret } from "./secrets";

export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");

export const appNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "App name must be alphanumeric with hyphens or underscores"
  )
  .transform((value) => value.toLowerCase());

function generateInternalSlug(): string {
  return `app-${randomBytes(6).toString("hex")}`;
}

const appFieldsSchema = z.object({
  slug: slugSchema.optional(),
  app_name: appNameSchema,
  display_name: z.string().min(1).max(255),
  scaling_enabled: z.boolean().optional().default(false),
  min_dynos: z.coerce.number().int().min(1).optional().default(1),
  max_dynos: z.coerce.number().int().min(1).optional().default(10),
  response_time_threshold_ms: z.coerce.number().int().positive().optional().default(2000),
  memory_threshold_percent: z.coerce.number().min(1).max(100).optional().default(85),
  scale_up_cooldown_seconds: z.coerce.number().int().min(0).optional().default(300),
  scale_down_cooldown_seconds: z.coerce.number().int().min(0).optional().default(600),
  worker_scaling_enabled: z.boolean().optional().default(false),
  worker_min_dynos: z.coerce.number().int().min(0).optional().default(1),
  worker_max_dynos: z.coerce.number().int().min(1).optional().default(5),
  worker_queue_size_threshold: z.coerce.number().int().min(1).optional().default(10),
  worker_queue_latency_threshold_ms: z.coerce.number().int().positive().optional().default(5000),
  worker_memory_threshold_percent: z.coerce.number().min(1).max(100).optional().default(85),
  worker_scale_up_cooldown_seconds: z.coerce.number().int().min(0).optional().default(300),
  worker_scale_down_cooldown_seconds: z.coerce.number().int().min(0).optional().default(600),
  heroku_api_key: z.string().optional(),
});

const dynoRangeRefine = {
  refine: (data: {
    min_dynos?: number;
    max_dynos?: number;
    worker_min_dynos?: number;
    worker_max_dynos?: number;
  }) =>
    (data.min_dynos === undefined ||
      data.max_dynos === undefined ||
      data.min_dynos <= data.max_dynos) &&
    (data.worker_min_dynos === undefined ||
      data.worker_max_dynos === undefined ||
      data.worker_min_dynos <= data.worker_max_dynos),
  message: "min_dynos cannot exceed max_dynos" as const,
  path: ["min_dynos"] as const,
};

export const createAppSchema = appFieldsSchema.refine(dynoRangeRefine.refine, {
  message: dynoRangeRefine.message,
  path: [...dynoRangeRefine.path],
});

export const updateAppSchema = appFieldsSchema
  .omit({ slug: true })
  .partial()
  .refine(dynoRangeRefine.refine, {
    message: dynoRangeRefine.message,
    path: [...dynoRangeRefine.path],
  });

export type CreateAppInput = z.infer<typeof createAppSchema>;
export type UpdateAppInput = z.infer<typeof updateAppSchema>;

export async function listApps(): Promise<App[]> {
  return prisma.app.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getAppBySlug(slug: string): Promise<App | null> {
  return prisma.app.findUnique({ where: { slug } });
}

export async function getAppByName(appName: string): Promise<App | null> {
  return prisma.app.findUnique({
    where: { appName: appName.toLowerCase() },
  });
}

export async function createApp(input: CreateAppInput): Promise<{ app: App; webhookSecret: string }> {
  const webhookSecret = generateWebhookSecret();
  const slug = input.slug ?? generateInternalSlug();

  const app = await prisma.app.create({
    data: {
      slug,
      appName: input.app_name,
      displayName: input.display_name,
      webhookSecretHash: hashSecret(webhookSecret),
      scalingEnabled: input.scaling_enabled,
      minDynos: input.min_dynos,
      maxDynos: input.max_dynos,
      responseTimeThresholdMs: input.response_time_threshold_ms,
      memoryThresholdPercent: input.memory_threshold_percent,
      scaleUpCooldownSeconds: input.scale_up_cooldown_seconds,
      scaleDownCooldownSeconds: input.scale_down_cooldown_seconds,
      workerScalingEnabled: input.worker_scaling_enabled,
      workerMinDynos: input.worker_min_dynos,
      workerMaxDynos: input.worker_max_dynos,
      workerQueueSizeThreshold: input.worker_queue_size_threshold,
      workerQueueLatencyThresholdMs: input.worker_queue_latency_threshold_ms,
      workerMemoryThresholdPercent: input.worker_memory_threshold_percent,
      workerScaleUpCooldownSeconds: input.worker_scale_up_cooldown_seconds,
      workerScaleDownCooldownSeconds: input.worker_scale_down_cooldown_seconds,
      herokuApiKey: input.heroku_api_key?.trim() || null,
      formations: {
        create: [
          { processType: "web", currentDynos: input.min_dynos },
          { processType: "worker", currentDynos: input.worker_min_dynos },
        ],
      },
    },
  });

  return { app, webhookSecret };
}

export async function updateApp(slug: string, input: UpdateAppInput): Promise<App> {
  const data: Prisma.AppUpdateInput = {};

  if (input.app_name !== undefined) data.appName = input.app_name;
  if (input.display_name !== undefined) data.displayName = input.display_name;
  if (input.scaling_enabled !== undefined) data.scalingEnabled = input.scaling_enabled;
  if (input.min_dynos !== undefined) data.minDynos = input.min_dynos;
  if (input.max_dynos !== undefined) data.maxDynos = input.max_dynos;
  if (input.response_time_threshold_ms !== undefined) {
    data.responseTimeThresholdMs = input.response_time_threshold_ms;
  }
  if (input.memory_threshold_percent !== undefined) {
    data.memoryThresholdPercent = input.memory_threshold_percent;
  }
  if (input.scale_up_cooldown_seconds !== undefined) {
    data.scaleUpCooldownSeconds = input.scale_up_cooldown_seconds;
  }
  if (input.scale_down_cooldown_seconds !== undefined) {
    data.scaleDownCooldownSeconds = input.scale_down_cooldown_seconds;
  }
  if (input.worker_scaling_enabled !== undefined) {
    data.workerScalingEnabled = input.worker_scaling_enabled;
  }
  if (input.worker_min_dynos !== undefined) data.workerMinDynos = input.worker_min_dynos;
  if (input.worker_max_dynos !== undefined) data.workerMaxDynos = input.worker_max_dynos;
  if (input.worker_queue_size_threshold !== undefined) {
    data.workerQueueSizeThreshold = input.worker_queue_size_threshold;
  }
  if (input.worker_queue_latency_threshold_ms !== undefined) {
    data.workerQueueLatencyThresholdMs = input.worker_queue_latency_threshold_ms;
  }
  if (input.worker_memory_threshold_percent !== undefined) {
    data.workerMemoryThresholdPercent = input.worker_memory_threshold_percent;
  }
  if (input.worker_scale_up_cooldown_seconds !== undefined) {
    data.workerScaleUpCooldownSeconds = input.worker_scale_up_cooldown_seconds;
  }
  if (input.worker_scale_down_cooldown_seconds !== undefined) {
    data.workerScaleDownCooldownSeconds = input.worker_scale_down_cooldown_seconds;
  }
  if (input.heroku_api_key !== undefined) {
    data.herokuApiKey = input.heroku_api_key.trim() || null;
  }

  return prisma.app.update({ where: { slug }, data });
}

export async function deleteApp(slug: string): Promise<void> {
  await prisma.app.delete({ where: { slug } });
}

export async function regenerateAppWebhookSecret(
  slug: string
): Promise<{ app: App; webhookSecret: string }> {
  const webhookSecret = generateWebhookSecret();
  const app = await prisma.app.update({
    where: { slug },
    data: { webhookSecretHash: hashSecret(webhookSecret) },
  });
  return { app, webhookSecret };
}

export async function findAppByNameForWebhook(appName: string): Promise<App | null> {
  return getAppByName(appName);
}
