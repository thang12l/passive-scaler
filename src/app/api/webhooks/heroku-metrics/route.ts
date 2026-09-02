import { NextRequest, NextResponse } from "next/server";
import { getConfig, getPublicConfig, isHerokuConfigured } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getOrCreateState, processMetrics } from "@/lib/scaling-service";
import {
  normalizeMetricsForScaling,
  parseMetricsPayload,
  validateAppName,
  validateWebhookSecret,
} from "@/lib/validator";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const bodySecret =
      body !== null && typeof body === "object" && "secret_token" in body
        ? (body as { secret_token?: string }).secret_token
        : undefined;

    if (!validateWebhookSecret(authHeader, bodySecret)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = parseMetricsPayload(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error, details: parsed.details },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const metrics = normalizeMetricsForScaling(payload);

    if (!validateAppName(payload.app_name)) {
      return NextResponse.json({ success: false, error: "Unknown app" }, { status: 403 });
    }

    await getOrCreateState(payload.app_name);

    const decision = await processMetrics(payload.app_name, metrics);

    logger.info("Scaling decision", {
      appName: payload.app_name,
      processType: metrics.processType,
      dyno: metrics.dyno,
      shouldScale: decision.shouldScale,
      action: decision.action,
      reason: decision.reason,
    });

    return NextResponse.json({
      success: true,
      dry_run: decision.dryRun,
      heroku_enabled: isHerokuConfigured(),
      received: {
        app_name: payload.app_name,
        process_type: metrics.processType ?? null,
        dyno: metrics.dyno ?? null,
        timestamp: metrics.reportedAt ?? null,
      },
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
    accepted_fields: {
      required: ["app_name", "timestamp"],
      optional: [
        "process_type",
        "dyno",
        "avg_response_time",
        "avg_queue_time",
        "memory_percent",
        "requests_per_minute",
        "sample_count",
        "queue_size",
        "queue_depths",
        "queue_latencies",
        "secret_token",
      ],
    },
  });
}
