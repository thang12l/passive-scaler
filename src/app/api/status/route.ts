import { NextRequest, NextResponse } from "next/server";
import { getPublicAppConfig } from "@/lib/app-config";
import { getAppBySlug } from "@/lib/apps-service";
import { getOrCreateState, getAppStatus } from "@/lib/scaling-service";
import { validateAppWebhookSecret } from "@/lib/validator";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("app") ?? request.nextUrl.searchParams.get("app_name");
  if (!slug) {
    return NextResponse.json(
      { success: false, error: "Missing app query parameter (?app=<slug>)" },
      { status: 400 }
    );
  }

  const app = await getAppBySlug(slug);
  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  const authHeader = request.headers.get("authorization");
  if (!validateAppWebhookSecret(app, authHeader, undefined)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await getOrCreateState(app);
  const state = await getAppStatus(slug);

  if (!state) {
    return NextResponse.json({ success: false, error: "State not found" }, { status: 404 });
  }

  return NextResponse.json({
    app_name: app.slug,
    current_dynos: state.currentDynos,
    last_scale_time: state.lastScaleTime?.toISOString() ?? null,
    last_action: state.lastAction,
    last_metrics: {
      response_time: state.lastResponseTime ? Number(state.lastResponseTime) : null,
      memory_percent: state.lastMemoryPercent ? Number(state.lastMemoryPercent) : null,
    },
    config: getPublicAppConfig(app),
    recent_events: state.app.events.map((event) => ({
      action: event.action,
      reason: event.reason,
      created_at: event.createdAt.toISOString(),
    })),
  });
}
