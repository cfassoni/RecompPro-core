import { NextRequest } from "next/server";
import { handleHevyWebhook } from "@/lib/hevy/webhookHandler";

/**
 * Base webhook endpoint for Hevy Developer integration.
 * URL: /api/integrations/hevy/webhook
 * Authenticates via HTTP `Authorization: Bearer <token>` header.
 */
export async function POST(req: NextRequest) {
  return handleHevyWebhook(req);
}
