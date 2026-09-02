import { z } from "zod";

const configSchema = z.object({
  HEROKU_API_KEY: z.string().min(1),
  TARGET_HEROKU_APP: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(16),
  MIN_DYNOS: z.coerce.number().int().min(1).default(1),
  MAX_DYNOS: z.coerce.number().int().min(1).default(10),
  RESPONSE_TIME_THRESHOLD_MS: z.coerce.number().positive().default(2000),
  MEMORY_THRESHOLD_PERCENT: z.coerce.number().min(1).max(100).default(85),
  SCALE_UP_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(300),
  SCALE_DOWN_COOLDOWN_SECONDS: z.coerce.number().int().min(0).default(600),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof configSchema> & {
  scaleDownResponseTimeThresholdMs: number;
  scaleDownMemoryThresholdPercent: number;
};

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid configuration: ${missing}`);
  }

  const base = parsed.data;
  if (base.MIN_DYNOS > base.MAX_DYNOS) {
    throw new Error("MIN_DYNOS cannot be greater than MAX_DYNOS");
  }

  cachedConfig = {
    ...base,
    scaleDownResponseTimeThresholdMs: base.RESPONSE_TIME_THRESHOLD_MS * 0.5,
    scaleDownMemoryThresholdPercent: base.MEMORY_THRESHOLD_PERCENT * 0.5,
  };

  return cachedConfig;
}

export function getPublicConfig() {
  const config = getConfig();
  return {
    min_dynos: config.MIN_DYNOS,
    max_dynos: config.MAX_DYNOS,
    thresholds: {
      response_time_ms: config.RESPONSE_TIME_THRESHOLD_MS,
      memory_percent: config.MEMORY_THRESHOLD_PERCENT,
      scale_down_response_time_ms: config.scaleDownResponseTimeThresholdMs,
      scale_down_memory_percent: config.scaleDownMemoryThresholdPercent,
    },
    cooldowns: {
      scale_up_seconds: config.SCALE_UP_COOLDOWN_SECONDS,
      scale_down_seconds: config.SCALE_DOWN_COOLDOWN_SECONDS,
    },
  };
}
