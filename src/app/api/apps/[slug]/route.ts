import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { serializeApp } from "@/lib/app-config";
import { resolveAppBaseUrl } from "@/lib/platform-config";
import { deleteApp, getAppBySlug, updateApp, updateAppSchema } from "@/lib/apps-service";
import { getAppStatus } from "@/lib/scaling-service";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const app = await getAppBySlug(slug);
  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  const status = await getAppStatus(slug);
  const baseUrl = resolveAppBaseUrl(request.nextUrl.origin);

  return NextResponse.json({
    app: serializeApp(app),
    webhook_url: `${baseUrl}/api/webhooks/metrics`,
    state: status
      ? {
          current_dynos: status.currentDynos,
          last_scale_time: status.lastScaleTime?.toISOString() ?? null,
          last_action: status.lastAction,
          last_metrics: {
            response_time: status.lastResponseTime ? Number(status.lastResponseTime) : null,
            memory_percent: status.lastMemoryPercent ? Number(status.lastMemoryPercent) : null,
          },
          recent_events: status.app.events.map((event) => ({
            action: event.action,
            reason: event.reason,
            created_at: event.createdAt.toISOString(),
          })),
        }
      : null,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const existing = await getAppBySlug(slug);
  if (!existing) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const app = await updateApp(slug, parsed.data);
  const baseUrl = resolveAppBaseUrl(request.nextUrl.origin);

  return NextResponse.json({
    app: serializeApp(app),
    webhook_url: `${baseUrl}/api/webhooks/metrics`,
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const existing = await getAppBySlug(slug);
  if (!existing) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  await deleteApp(slug);
  return NextResponse.json({ success: true });
}
