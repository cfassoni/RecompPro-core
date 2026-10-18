import { NextRequest } from "next/server";
import { handleHevyWebhook } from "@/lib/hevy/webhookHandler";

interface RouteParams {
  params: Promise<{
    token: string;
  }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  return handleHevyWebhook(req, token);
}

