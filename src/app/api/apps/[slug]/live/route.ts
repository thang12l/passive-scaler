import { NextRequest } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getAppBySlug } from "@/lib/apps-service";
import { subscribeMetricsProcessed } from "@/lib/metrics-live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requireAdminAuth(request);
  if (!auth.authorized) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const app = await getAppBySlug(slug);
  if (!app) {
    return Response.json({ success: false, error: "App not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      unsubscribe = subscribeMetricsProcessed(slug, (payload) => {
        try {
          send("metrics", payload);
        } catch {
          // Client already disconnected.
        }
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // Client already disconnected.
        }
      }, 15_000);

      send("ready", { slug });

      const close = () => {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
