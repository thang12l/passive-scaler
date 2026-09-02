import { NextRequest, NextResponse } from "next/server";
import { getConfig, getPublicConfig, isHerokuConfigured } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getOrCreateState, processMetrics } from "@/lib/scaling-service";
import {
  metricsPayloadSchema,
  validateAppName,
  validateWebhookSecret,
} from "@/lib/validator";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get("authorization");

    if (!validateWebhookSecret(authHeader, body.secret_token)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = metricsPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { app_name, avg_response_time, memory_percent } = parsed.data;

    if (!validateAppName(app_name)) {
      return NextResponse.json({ success: false, error: "Unknown app" }, { status: 403 });
    }

    await getOrCreateState(app_name);

    const decision = await processMetrics(app_name, {
      avgResponseTime: avg_response_time,
      memoryPercent: memory_percent,
    });

    logger.info("Scaling decision", {
      appName: app_name,
      shouldScale: decision.shouldScale,
      action: decision.action,
      reason: decision.reason,
    });

    return NextResponse.json({
      success: true,
      dry_run: decision.dryRun,
      heroku_enabled: isHerokuConfigured(),
      decision: {
        should_scale: decision.shouldScale,
        action: decision.action,
        current_dynos: decision.currentDynos,
        target_dynos: decision.targetDynos,
        reason: decision.reason,
      },
    });
  } catch (error) {
    logger.error("Webhook handler failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/webhooks/heroku-metrics",
    method: "POST",
    target_app: getConfig().TARGET_HEROKU_APP,
    config: getPublicConfig(),
  });
}
