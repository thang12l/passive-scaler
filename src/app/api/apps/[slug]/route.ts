import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import {
  serializeApp,
  serializeFormationState,
  serializeScalingEvent,
} from "@/lib/app-config";
import { resolveAppBaseUrl } from "@/lib/platform-config";
import { deleteApp, getAppBySlug, updateApp, updateAppSchema } from "@/lib/apps-service";
import { getAppFormations, listAppEvents } from "@/lib/scaling-service";

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

  const formations = await getAppFormations(slug);
  const { events } = await listAppEvents(slug, { limit: 10 });
  const baseUrl = resolveAppBaseUrl(request.nextUrl.origin);

  const lastReportedAt = formations.reduce<Date | null>((latest, formation) => {
    if (!latest || formation.updatedAt > latest) return formation.updatedAt;
    return latest;
  }, null);

  return NextResponse.json({
    app: serializeApp(app),
    webhook_url: `${baseUrl}/api/webhooks/metrics`,
    last_reported_at: lastReportedAt?.toISOString() ?? null,
    formations: formations.map(serializeFormationState),
    recent_events: events.map(serializeScalingEvent),
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
