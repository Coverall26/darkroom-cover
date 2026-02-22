import { NextApiRequest, NextApiResponse } from "next";
import { updateInvestorKycStatus } from "@/lib/persona-hooks";
import { verifyWebhookSignature, parseWebhookEvent } from "@/lib/persona";
import { reportError } from "@/lib/error";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const buf = await buffer(req);
    const rawBody = buf.toString("utf8");

    // Verify webhook signature - REQUIRED for security
    const webhookSecret = process.env.PERSONA_WEBHOOK_SECRET;
    const signature = req.headers["persona-signature"] as string;

    if (!webhookSecret) {
      console.error("[PERSONA_WEBHOOK] PERSONA_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Internal server error" });
    }

    if (!signature) {
      console.error("[PERSONA_WEBHOOK] Missing persona-signature header");
      return res.status(401).json({ error: "Missing signature" });
    }

    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      console.error("[PERSONA_WEBHOOK] Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody);
    
    // Parse the webhook event
    const event = parseWebhookEvent(payload);
    
    // Handle different event types
    switch (event.eventName) {
      case "inquiry.completed":
      case "inquiry.approved":
      case "inquiry.declined":
      case "inquiry.expired":
      case "inquiry.failed":
      case "inquiry.transitioned":
        await updateInvestorKycStatus({
          inquiryId: event.inquiryId,
          status: event.status,
          referenceId: event.referenceId,
          data: event.data,
        });
        break;
      
      case "inquiry.started":
      case "inquiry.created":
        // No action needed for these events
        break;

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    reportError(error as Error);
    console.error("[PERSONA_WEBHOOK] Error processing webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
