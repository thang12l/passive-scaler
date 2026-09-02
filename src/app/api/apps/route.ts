import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { serializeApp } from "@/lib/app-config";
import { resolveAppBaseUrl } from "@/lib/platform-config";
import { createApp, createAppSchema, listApps } from "@/lib/apps-service";

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listApps();
  const baseUrl = resolveAppBaseUrl(request.nextUrl.origin);

  return NextResponse.json({
    apps: apps.map((app) => ({
      ...serializeApp(app),
      webhook_url: `${baseUrl}/api/webhooks/metrics`,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createAppSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { app, webhookSecret } = await createApp(parsed.data);
    const baseUrl = resolveAppBaseUrl(request.nextUrl.origin);

    return NextResponse.json(
      {
        app: serializeApp(app),
        webhook_secret: webhookSecret,
        webhook_url: `${baseUrl}/api/webhooks/metrics`,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[] | undefined) ?? [];
      const field = target.includes("app_name") ? "App name" : "Internal ID";
      return NextResponse.json({ success: false, error: `${field} already exists` }, { status: 409 });
    }
    throw error;
  }
}
