import { z } from "zod";

const platformConfigSchema = z.object({
  ADMIN_SECRET: z.string().min(16),
  HEROKU_API_KEY: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_BASE_URL: z.string().url().optional(),
});

export type PlatformConfig = z.infer<typeof platformConfigSchema>;

const PLACEHOLDER_HEROKU_KEYS = new Set(["", "your-heroku-api-key", "changeme"]);

let cached: PlatformConfig | null = null;

export function getPlatformConfig(): PlatformConfig {
  if (cached) return cached;

  const parsed = platformConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid platform configuration: ${missing}`);
  }

  cached = parsed.data;
  return cached;
}

export function getPlatformHerokuApiKey(): string | null {
  const key = getPlatformConfig().HEROKU_API_KEY.trim();
  if (PLACEHOLDER_HEROKU_KEYS.has(key)) return null;
  return key;
}

export function resolveAppBaseUrl(requestOrigin?: string): string {
  const config = getPlatformConfig();
  if (config.APP_BASE_URL) return config.APP_BASE_URL.replace(/\/$/, "");
  if (requestOrigin) return requestOrigin.replace(/\/$/, "");
  return "http://localhost:3000";
}
