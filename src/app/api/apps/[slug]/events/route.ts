import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { serializeScalingEvent } from "@/lib/app-config";
import { getAppBySlug } from "@/lib/apps-service";
import { resolveProcessType } from "@/lib/process-type";
import { listAppEvents } from "@/lib/scaling-service";

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

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  const processTypeParam = request.nextUrl.searchParams.get("process_type");
  const processType = processTypeParam ? resolveProcessType(processTypeParam) : undefined;

  const result = await listAppEvents(slug, { limit, offset, processType });

  return NextResponse.json({
    events: result.events.map(serializeScalingEvent),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  });
}
