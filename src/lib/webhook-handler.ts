import { NextRequest, NextResponse } from "next/server";
import { getPublicAppConfig, isLiveScaling } from "@/lib/app-config";
import { findAppByNameForWebhook } from "@/lib/apps-service";
import { isWebhookDebugEnabled, logger } from "@/lib/logger";
import { getOrCreateFormationStates, processMetrics } from "@/lib/scaling-service";
import {
  normalizeMetricsForScaling,
  parseMetricsPayload,
  validateAppWebhookSecret,
} from "@/lib/validator";

function logUnsuccessfulWebhook(
  request: NextRequest,
  status: number,
  error: string,
  extra?: Record<string, unknown>
) {
  if (!isWebhookDebugEnabled()) return;
  logger.warn("Webhook request unsuccessful", {
    status,
    error,
    method: request.method,
    path: request.nextUrl.pathname,
    ...extra,
  });
}

export async function handleMetricsWebhook(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      logUnsuccessfulWebhook(request, 400, "Request body must be valid JSON", {
        contentType: request.headers.get("content-type"),
      });
      return NextResponse.json(
        { success: false, error: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    const parsed = parseMetricsPayload(body);
    if (!parsed.success) {
      logUnsuccessfulWebhook(request, 400, parsed.error, {
        details: parsed.details,
        appName:
          body !== null && typeof body === "object" && "app_name" in body
            ? (body as { app_name?: unknown }).app_name
            : undefined,
      });
      return NextResponse.json(
        { success: false, error: parsed.error, details: parsed.details },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const app = await findAppByNameForWebhook(payload.app_name);
    if (!app) {
      logUnsuccessfulWebhook(request, 404, "Unknown app", {
        appName: payload.app_name,
        processType: payload.process_type,
      });
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
      logUnsuccessfulWebhook(request, 401, "Unauthorized", {
        appName: payload.app_name,
        appSlug: app.slug,
        authViaHeader: Boolean(authHeader?.startsWith("Bearer ")),
        authViaBody: Boolean(bodySecret),
      });
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const metrics = normalizeMetricsForScaling(payload);
    await getOrCreateFormationStates(app);
    const decision = await processMetrics(app, metrics);

    logger.info("Scaling decision", {
      appSlug: app.slug,
      processType: decision.processType,
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
        process_type: decision.processType,
        dyno: metrics.dyno ?? null,
        timestamp: metrics.reportedAt ?? null,
      },
      config: getPublicAppConfig(app),
      decision: {
        process_type: decision.processType,
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
