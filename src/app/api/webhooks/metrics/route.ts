import { NextRequest } from "next/server";
import { handleMetricsWebhook, metricsWebhookInfo } from "@/lib/webhook-handler";

export async function POST(request: NextRequest) {
  return handleMetricsWebhook(request);
}

export async function GET() {
  return Response.json(metricsWebhookInfo());
}
