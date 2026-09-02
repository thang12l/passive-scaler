import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { serializeApp, serializeFormationState } from "@/lib/app-config";
import { resolveAppBaseUrl } from "@/lib/platform-config";
import { createApp, createAppSchema, listApps } from "@/lib/apps-service";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listApps();
  const formations = await prisma.formationState.findMany({
    where: { appSlug: { in: apps.map((app) => app.slug) } },
  });
  const baseUrl = resolveAppBaseUrl(request.nextUrl.origin);

  return NextResponse.json({
    apps: apps.map((app) => {
      const appFormations = formations.filter((f) => f.appSlug === app.slug);
      const lastReportedAt = appFormations.reduce<Date | null>((latest, formation) => {
        if (!latest || formation.updatedAt > latest) return formation.updatedAt;
        return latest;
      }, null);

      return {
        ...serializeApp(app),
        webhook_url: `${baseUrl}/api/webhooks/metrics`,
        last_reported_at: lastReportedAt?.toISOString() ?? null,
        formations: appFormations.map(serializeFormationState),
      };
    }),
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
