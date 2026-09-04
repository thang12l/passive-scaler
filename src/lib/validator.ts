import { z } from "zod";
import type { App } from "@prisma/client";
import { resolveProcessType } from "./process-type";
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

const metricsFieldsSchema = z.object({
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
});

export const metricsPayloadSchema = metricsFieldsSchema
  .extend({
    app_name: z.string().min(1),
    timestamp: timestampSchema,
    secret_token: z.string().min(1).optional(),
  })
  .passthrough();

const metricsReportSchema = metricsFieldsSchema.extend({
  timestamp: timestampSchema.optional(),
});

const batchPayloadSchema = z
  .object({
    app_name: z.string().min(1),
    timestamp: timestampSchema.optional(),
    secret_token: z.string().min(1).optional(),
    reports: z.array(metricsReportSchema).min(1).max(2),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.reports.forEach((report, index) => {
      if (!report.timestamp && !data.timestamp) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "timestamp is required on the envelope or each report",
          path: ["reports", index, "timestamp"],
        });
      }

      const processType = resolveProcessType(report.process_type);
      if (seen.has(processType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each report must use a distinct process_type",
          path: ["reports", index, "process_type"],
        });
      }
      seen.add(processType);
    });
  });

export type MetricsPayload = z.infer<typeof metricsPayloadSchema>;

export type ParsedMetricsRequest = {
  app_name: string;
  secret_token?: string;
  reports: MetricsPayload[];
};

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

function invalidPayload(error: z.ZodError): {
  success: false;
  error: string;
  details: ReturnType<z.ZodError["format"]>;
} {
  return {
    success: false,
    error: "Invalid payload",
    details: error.format(),
  };
}

function toMetricsPayload(
  appName: string,
  timestamp: string,
  report: z.infer<typeof metricsReportSchema>,
  secretToken?: string
): MetricsPayload {
  return {
    ...report,
    app_name: appName,
    timestamp: report.timestamp ?? timestamp,
    secret_token: secretToken,
  };
}

export function parseMetricsPayload(body: unknown):
  | { success: true; data: ParsedMetricsRequest }
  | { success: false; error: string; details?: ReturnType<z.ZodError["format"]> } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { success: false, error: "Request body must be a JSON object" };
  }

  const record = body as Record<string, unknown>;
  if ("reports" in record && record.reports !== undefined) {
    const parsed = batchPayloadSchema.safeParse(record);
    if (!parsed.success) return invalidPayload(parsed.error);

    const envelopeTimestamp = parsed.data.timestamp;
    return {
      success: true,
      data: {
        app_name: parsed.data.app_name,
        secret_token: parsed.data.secret_token,
        reports: parsed.data.reports.map((report) =>
          toMetricsPayload(
            parsed.data.app_name,
            report.timestamp ?? envelopeTimestamp ?? "",
            report,
            parsed.data.secret_token
          )
        ),
      },
    };
  }

  const parsed = metricsPayloadSchema.safeParse(record);
  if (!parsed.success) return invalidPayload(parsed.error);

  return {
    success: true,
    data: {
      app_name: parsed.data.app_name,
      secret_token: parsed.data.secret_token,
      reports: [parsed.data],
    },
  };
}
