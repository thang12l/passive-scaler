import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { serializeApp } from "@/lib/app-config";
import { getAppBySlug, regenerateAppWebhookSecret } from "@/lib/apps-service";

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const existing = await getAppBySlug(slug);
  if (!existing) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  const { app, webhookSecret } = await regenerateAppWebhookSecret(slug);

  return NextResponse.json({
    app: serializeApp(app),
    webhook_secret: webhookSecret,
  });
}
