import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { getConfig } from "./config";

export const metricsPayloadSchema = z.object({
  app_name: z.string().min(1),
  avg_response_time: z.number().nonnegative(),
  memory_percent: z.number().min(0).max(100),
  requests_per_minute: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  secret_token: z.string().min(1).optional(),
});

export type MetricsPayload = z.infer<typeof metricsPayloadSchema>;

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function validateWebhookSecret(
  headerSecret: string | null,
  bodySecret: string | undefined
): boolean {
  const expected = getConfig().WEBHOOK_SECRET;
  if (headerSecret?.startsWith("Bearer ")) {
    return safeCompare(headerSecret.slice(7), expected);
  }
  if (bodySecret) {
    return safeCompare(bodySecret, expected);
  }
  return false;
}

export function validateAppName(appName: string): boolean {
  return appName === getConfig().TARGET_HEROKU_APP;
}
