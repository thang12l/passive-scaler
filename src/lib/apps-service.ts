import { z } from "zod";
import type { App, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { generateWebhookSecret, hashSecret } from "./secrets";

export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");

const appFieldsSchema = z.object({
  slug: slugSchema,
  display_name: z.string().min(1).max(255),
  heroku_app_name: z.string().min(1).max(255).optional(),
  scaling_enabled: z.boolean().optional().default(true),
  dry_run: z.boolean().optional().default(true),
  min_dynos: z.coerce.number().int().min(1).optional().default(1),
  max_dynos: z.coerce.number().int().min(1).optional().default(10),
  response_time_threshold_ms: z.coerce.number().int().positive().optional().default(2000),
  memory_threshold_percent: z.coerce.number().min(1).max(100).optional().default(85),
  scale_up_cooldown_seconds: z.coerce.number().int().min(0).optional().default(300),
  scale_down_cooldown_seconds: z.coerce.number().int().min(0).optional().default(600),
  heroku_api_key: z.string().optional(),
});

const dynoRangeRefine = {
  refine: (data: { min_dynos?: number; max_dynos?: number }) =>
    data.min_dynos === undefined ||
    data.max_dynos === undefined ||
    data.min_dynos <= data.max_dynos,
  message: "min_dynos cannot exceed max_dynos" as const,
  path: ["min_dynos"] as const,
};

export const createAppSchema = appFieldsSchema
  .refine(dynoRangeRefine.refine, {
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

export async function createApp(input: CreateAppInput): Promise<{ app: App; webhookSecret: string }> {
  const webhookSecret = generateWebhookSecret();
  const herokuAppName = input.heroku_app_name?.trim() || input.slug;

  const app = await prisma.app.create({
    data: {
      slug: input.slug,
      displayName: input.display_name,
      herokuAppName,
      webhookSecretHash: hashSecret(webhookSecret),
      scalingEnabled: input.scaling_enabled,
      dryRun: input.dry_run,
      minDynos: input.min_dynos,
      maxDynos: input.max_dynos,
      responseTimeThresholdMs: input.response_time_threshold_ms,
      memoryThresholdPercent: input.memory_threshold_percent,
      scaleUpCooldownSeconds: input.scale_up_cooldown_seconds,
      scaleDownCooldownSeconds: input.scale_down_cooldown_seconds,
      herokuApiKey: input.heroku_api_key?.trim() || null,
      scalingState: {
        create: {
          currentDynos: input.min_dynos,
        },
      },
    },
  });

  return { app, webhookSecret };
}

export async function updateApp(slug: string, input: UpdateAppInput): Promise<App> {
  const data: Prisma.AppUpdateInput = {};

  if (input.display_name !== undefined) data.displayName = input.display_name;
  if (input.heroku_app_name !== undefined) data.herokuAppName = input.heroku_app_name;
  if (input.scaling_enabled !== undefined) data.scalingEnabled = input.scaling_enabled;
  if (input.dry_run !== undefined) data.dryRun = input.dry_run;
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

export async function findAppBySlugForWebhook(slug: string): Promise<App | null> {
  return prisma.app.findUnique({ where: { slug } });
}
