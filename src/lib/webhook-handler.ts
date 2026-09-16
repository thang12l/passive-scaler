import { NextRequest, NextResponse } from "next/server";
import { getPublicAppConfig, isLiveScaling } from "@/lib/app-config";
import { findAppByNameForWebhook } from "@/lib/apps-service";
import { isWebhookDebugEnabled, logger } from "@/lib/logger";
import { notifyMetricsProcessed } from "@/lib/metrics-live";
import {
  getOrCreateFormationStates,
  processMetrics,
  type ProcessMetricsResult,
} from "@/lib/scaling-service";
import type { MetricsInput } from "@/lib/scaling-engine";
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

// Bound diagnostic output and redact credentials even in unexpected/nested fields.
function redactedWebhookPayload(body: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof body === "string") {
    return body.length > 2000 ? `${body.slice(0, 2000)}[truncated]` : body;
  }
  if (Array.isArray(body)) {
    return body.slice(0, 50).map((value) => redactedWebhookPayload(value, depth + 1));
  }
  if (body === null || typeof body !== "object") return body;
  return Object.fromEntries(
    Object.entries(body).slice(0, 50).map(([key, value]) => [
      key,
      /secret|token|password|authorization|cookie|api[_-]?key/i.test(key)
        ? "[redacted]"
        : redactedWebhookPayload(value, depth + 1),
    ])
  );
}

function receivedEcho(appName: string, decision: ProcessMetricsResult, metrics: MetricsInput) {
  return {
    app_name: appName,
    process_type: decision.processType,
    dyno: metrics.dyno ?? null,
    timestamp: metrics.reportedAt ?? null,
  };
}

function decisionEcho(decision: ProcessMetricsResult) {
  return {
    process_type: decision.processType,
    should_scale: decision.shouldScale,
    action: decision.action,
    current_dynos: decision.currentDynos,
    target_dynos: decision.targetDynos,
    reason: decision.reason,
    execution_status: decision.executionStatus,
  };
}

function resultEcho(appName: string, decision: ProcessMetricsResult, metrics: MetricsInput) {
  return {
    scaling_enabled: decision.scalingEnabled,
    scaled: decision.scaled,
    received: receivedEcho(appName, decision, metrics),
    decision: decisionEcho(decision),
  };
}

export async function handleMetricsWebhook(request: NextRequest) {
  let body: unknown;
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = "parse_json";
  let appName: string | undefined;
  let reportIndex: number | undefined;
  let processType: string | undefined;
  let processedReports = 0;
  const diagnosticContext = () => ({
    requestId,
    stage,
    elapsedMs: Date.now() - startedAt,
    method: request.method,
    path: request.nextUrl.pathname,
    contentType: request.headers.get("content-type"),
    appName,
    reportIndex,
    processType,
    processedReports,
    payload: redactedWebhookPayload(body),
  });
  try {
    try {
      body = await request.json();
    } catch {
      logUnsuccessfulWebhook(request, 400, "Request body must be valid JSON", {
        ...diagnosticContext(),
      });
      return NextResponse.json(
        { success: false, error: "Request body must be valid JSON" },
        { status: 400 }
      );
    }

    stage = "validate_payload";
    const parsed = parseMetricsPayload(body);
    if (!parsed.success) {
      logUnsuccessfulWebhook(request, 400, parsed.error, {
        ...diagnosticContext(),
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

    const { reports } = parsed.data;
    appName = parsed.data.app_name;
    stage = "find_app";
    const app = await findAppByNameForWebhook(appName);
    if (!app) {
      logUnsuccessfulWebhook(request, 404, "Unknown app", {
        ...diagnosticContext(),
        appName,
        processTypes: reports.map((report) => report.process_type),
      });
      return NextResponse.json(
        {
          success: false,
          error: "Unknown app",
          app_name: appName,
          hint: "Create this app in the dashboard at /apps or ensure app_name matches the configured app name.",
        },
        { status: 404 }
      );
    }

    stage = "authenticate";
    const authHeader = request.headers.get("authorization");
    const bodySecret =
      body !== null && typeof body === "object" && "secret_token" in body
        ? (body as { secret_token?: string }).secret_token
        : undefined;

    if (!validateAppWebhookSecret(app, authHeader, bodySecret)) {
      logUnsuccessfulWebhook(request, 401, "Unauthorized", {
        ...diagnosticContext(),
        appName,
        appSlug: app.slug,
        authViaHeader: Boolean(authHeader?.startsWith("Bearer ")),
        authViaBody: Boolean(bodySecret),
      });
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    stage = "initialize_formation_states";
    await getOrCreateFormationStates(app);

    const processed: { metrics: MetricsInput; decision: ProcessMetricsResult }[] = [];
    for (const [index, report] of reports.entries()) {
      reportIndex = index;
      processType = report.process_type;
      stage = "normalize_metrics";
      const metrics = normalizeMetricsForScaling(report);
      stage = "process_metrics";
      const decision = await processMetrics(app, metrics);
      processed.push({ metrics, decision });
      processedReports = processed.length;

      logger.info("Scaling decision", {
        appName: app.appName,
        processType: decision.processType,
        dyno: metrics.dyno,
        shouldScale: decision.shouldScale,
        action: decision.action,
        reason: decision.reason,
        scaled: decision.scaled,
        executionStatus: decision.executionStatus,
      });
    }

    reportIndex = undefined;
    processType = undefined;
    stage = "notify_metrics_processed";
    notifyMetricsProcessed(app.slug);

    stage = "build_response";

    const liveScaling = isLiveScaling(app);
    const config = getPublicAppConfig(app);

    const [single] = processed;
    if (processed.length === 1 && single) {
      const { metrics, decision } = single;
      return NextResponse.json({
        success: true,
        scaling_enabled: decision.scalingEnabled,
        scaled: decision.scaled,
        live_scaling: liveScaling,
        received: receivedEcho(app.appName, decision, metrics),
        config,
        decision: decisionEcho(decision),
      });
    }

    return NextResponse.json({
      success: true,
      scaled: processed.some(({ decision }) => decision.scaled),
      live_scaling: liveScaling,
      config,
      results: processed.map(({ metrics, decision }) =>
        resultEcho(app.appName, decision, metrics)
      ),
    });
  } catch (error) {
    logger.error("Webhook handler failed", {
      ...diagnosticContext(),
      status: 500,
      error: error instanceof Error ? error.message : "unknown",
      errorName: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      errorCode:
        error instanceof Error && "code" in error ? error.code : undefined,
    });
    return NextResponse.json(
      { success: false, error: "Internal server error", requestId },
      { status: 500, headers: { "X-Request-ID": requestId } }
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
        "reports",
      ],
      reports:
        "Optional array of 1–2 metric objects (one per process_type). Envelope app_name, timestamp, and secret_token are shared.",
    },
  };
}
