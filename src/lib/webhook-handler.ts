import { NextRequest, NextResponse } from "next/server";
import { getPublicAppConfig, isLiveScaling } from "@/lib/app-config";
import { findAppByNameForWebhook } from "@/lib/apps-service";
import { logger } from "@/lib/logger";
import { getOrCreateState, processMetrics } from "@/lib/scaling-service";
import {
  normalizeMetricsForScaling,
  parseMetricsPayload,
  validateAppWebhookSecret,
} from "@/lib/validator";

export async function handleMetricsWebhook(request: NextRequest) {
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

    const parsed = parseMetricsPayload(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error, details: parsed.details },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const app = await findAppByNameForWebhook(payload.app_name);
    if (!app) {
      return NextResponse.json(
        {
          success: false,
          error: "Unknown app",
          app_name: payload.app_name,
          hint: "Create this app in the dashboard at /apps or ensure app_name matches the configured app name.",
        },
        { status: 404 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const bodySecret =
      body !== null && typeof body === "object" && "secret_token" in body
        ? (body as { secret_token?: string }).secret_token
        : undefined;

    if (!validateAppWebhookSecret(app, authHeader, bodySecret)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const metrics = normalizeMetricsForScaling(payload);
    await getOrCreateState(app);
    const decision = await processMetrics(app, metrics);

    logger.info("Scaling decision", {
      appSlug: app.slug,
      processType: metrics.processType,
      dyno: metrics.dyno,
      shouldScale: decision.shouldScale,
      action: decision.action,
      reason: decision.reason,
      scaled: decision.scaled,
    });

    return NextResponse.json({
      success: true,
      scaling_enabled: decision.scalingEnabled,
      scaled: decision.scaled,
      live_scaling: isLiveScaling(app),
      received: {
        app_name: app.appName,
        process_type: metrics.processType ?? null,
        dyno: metrics.dyno ?? null,
        timestamp: metrics.reportedAt ?? null,
      },
      config: getPublicAppConfig(app),
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

export function metricsWebhookInfo() {
  return {
    endpoint: "/api/webhooks/metrics",
    legacy_endpoint: "/api/webhooks/heroku-metrics",
    method: "POST",
    auth: "Authorization: Bearer <per-app-webhook-secret>",
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
  };
}
