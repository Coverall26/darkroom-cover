import { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
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

function verifyRollbarSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

interface RollbarWebhookPayload {
  event_name: string;
  data: {
    item?: {
      id: number;
      counter: number;
      environment: string;
      framework: string;
      hash: string;
      level: string;
      occurrences: number;
      project_id: number;
      title: string;
      last_occurrence_timestamp: number;
      first_occurrence_timestamp: number;
      status: string;
      unique_occurrences: number;
    };
    occurrence?: {
      id: string;
      timestamp: number;
      version: number;
      body?: {
        message?: {
          body: string;
        };
        trace?: {
          exception?: {
            class: string;
            message: string;
          };
        };
      };
      environment: string;
      level: string;
      server?: {
        host: string;
      };
      request?: {
        url: string;
        method: string;
      };
    };
  };
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

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.ROLLBAR_WEBHOOK_SECRET;
    const signature = req.headers["x-rollbar-signature"] as string;

    if (webhookSecret) {
      if (!signature) {
        console.error("[ROLLBAR_WEBHOOK] Missing x-rollbar-signature header");
        return res.status(401).json({ error: "Missing signature" });
      }

      try {
        const isValid = verifyRollbarSignature(rawBody, signature, webhookSecret);
        if (!isValid) {
          console.error("[ROLLBAR_WEBHOOK] Invalid signature");
          return res.status(401).json({ error: "Invalid signature" });
        }
      } catch (err) {
        console.error("[ROLLBAR_WEBHOOK] Signature verification error:", err);
        return res.status(401).json({ error: "Invalid signature" });
      }
    } else {
      console.warn("[ROLLBAR_WEBHOOK] ROLLBAR_WEBHOOK_SECRET not configured - signature verification skipped");
    }

    const payload: RollbarWebhookPayload = JSON.parse(rawBody);

    // Handle different event types
    // Add custom handling here (e.g., Slack notification, PagerDuty, etc.)
    // Supported events: new_item, occurrence, reactivated_item, resolved_item, reopened_item, exp_repeat_item

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[ROLLBAR_WEBHOOK] Error processing webhook:", error);
    reportError(error, { path: "/api/webhooks/rollbar", action: "process-webhook" });
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}
