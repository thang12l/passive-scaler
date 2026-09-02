import { NextRequest, NextResponse } from "next/server";
import {
  getPublicAppConfig,
  serializeFormationState,
  serializeScalingEvent,
} from "@/lib/app-config";
import { getAppByName } from "@/lib/apps-service";
import { resolveProcessType } from "@/lib/process-type";
import { getAppFormations, getOrCreateFormationStates, listAppEvents } from "@/lib/scaling-service";
import { validateAppWebhookSecret } from "@/lib/validator";

export async function GET(request: NextRequest) {
  const appName =
    request.nextUrl.searchParams.get("app") ??
    request.nextUrl.searchParams.get("app_name");
  if (!appName) {
    return NextResponse.json(
      { success: false, error: "Missing app query parameter (?app=<name>)" },
      { status: 400 }
    );
  }

  const app = await getAppByName(appName);
  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  const authHeader = request.headers.get("authorization");
  if (!validateAppWebhookSecret(app, authHeader, undefined)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  await getOrCreateFormationStates(app);
  const formations = await getAppFormations(app.slug);
  const processTypeParam = request.nextUrl.searchParams.get("process_type");
  const processType = processTypeParam ? resolveProcessType(processTypeParam) : undefined;
  const { events } = await listAppEvents(app.slug, { limit: 10, processType });

  return NextResponse.json({
    app_name: app.appName,
    formations: formations.map(serializeFormationState),
    config: getPublicAppConfig(app),
    recent_events: events.map(serializeScalingEvent),
  });
}
