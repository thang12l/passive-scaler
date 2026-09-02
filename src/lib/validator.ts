import { z } from "zod";
import type { App } from "@prisma/client";
import { verifySecret } from "./secrets";
import type { MetricsInput } from "./scaling-engine";

const numericRecord = z.record(z.union([z.number(), z.string()]).pipe(z.coerce.number()));

const timestampSchema = z
  .union([z.string(), z.number(), z.date()])
  .transform((value, ctx) => {
    const date =
      value instanceof Date
        ? value
        : typeof value === "number"
          ? new Date(value)
          : new Date(value.trim());

    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid timestamp" });
      return z.NEVER;
    }

    return date.toISOString();
  });

export const metricsPayloadSchema = z
  .object({
    app_name: z.string().min(1),
    process_type: z.enum(["web", "worker"]).optional(),
    dyno: z.string().optional(),
    avg_response_time: z.coerce.number().nonnegative().optional(),
    avg_queue_time: z.coerce.number().nonnegative().optional(),
    memory_percent: z.coerce.number().min(0).max(100).optional(),
    requests_per_minute: z.coerce.number().nonnegative().optional(),
    sample_count: z.coerce.number().int().nonnegative().optional(),
    queue_size: z.coerce.number().nonnegative().optional(),
    queue_depths: numericRecord.optional(),
    queue_latencies: numericRecord.optional(),
    timestamp: timestampSchema,
    secret_token: z.string().min(1).optional(),
  })
  .passthrough();

export type MetricsPayload = z.infer<typeof metricsPayloadSchema>;

function maxQueueLatency(latencies: Record<string, number> | undefined): number | undefined {
  if (!latencies) return undefined;
  const values = Object.values(latencies);
  return values.length > 0 ? Math.max(...values) : undefined;
}

export function normalizeMetricsForScaling(payload: MetricsPayload): MetricsInput {
  const avgResponseTime =
    payload.avg_response_time ??
    payload.avg_queue_time ??
    maxQueueLatency(payload.queue_latencies) ??
    0;

  const memoryPercent = payload.memory_percent ?? 0;

  return {
    avgResponseTime,
    memoryPercent,
    processType: payload.process_type,
    dyno: payload.dyno,
    requestsPerMinute: payload.requests_per_minute,
    sampleCount: payload.sample_count,
    queueSize: payload.queue_size,
    queueDepths: payload.queue_depths,
    queueLatencies: payload.queue_latencies,
    reportedAt: payload.timestamp,
  };
}

export function validateAppWebhookSecret(
  app: App,
  authHeader: string | null,
  bodySecret: string | undefined
): boolean {
  if (authHeader?.startsWith("Bearer ")) {
    return verifySecret(authHeader.slice(7), app.webhookSecretHash);
  }
  if (bodySecret) {
    return verifySecret(bodySecret, app.webhookSecretHash);
  }
  return false;
}

export function parseMetricsPayload(body: unknown):
  | { success: true; data: MetricsPayload }
  | { success: false; error: string; details?: z.ZodFormattedError<MetricsPayload> } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Request body must be a JSON object" };
  }

  const parsed = metricsPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid payload",
      details: parsed.error.format(),
    };
  }

  return { success: true, data: parsed.data };
}
