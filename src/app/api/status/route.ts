import { NextRequest, NextResponse } from "next/server";
import { getConfig, getPublicConfig } from "@/lib/config";
import { getOrCreateState, getStatus } from "@/lib/scaling-service";
import { validateWebhookSecret } from "@/lib/validator";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!validateWebhookSecret(authHeader, undefined)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const appName = getConfig().TARGET_HEROKU_APP;
  await getOrCreateState(appName);
  const state = await getStatus(appName);

  if (!state) {
    return NextResponse.json({ success: false, error: "State not found" }, { status: 404 });
  }

  return NextResponse.json({
    app_name: state.appName,
    current_dynos: state.currentDynos,
    last_scale_time: state.lastScaleTime?.toISOString() ?? null,
    last_action: state.lastAction,
    last_metrics: {
      response_time: state.lastResponseTime ? Number(state.lastResponseTime) : null,
      memory_percent: state.lastMemoryPercent ? Number(state.lastMemoryPercent) : null,
    },
    config: getPublicConfig(),
    recent_events: state.events.map((event) => ({
      action: event.action,
      reason: event.reason,
      created_at: event.createdAt.toISOString(),
    })),
  });
}
