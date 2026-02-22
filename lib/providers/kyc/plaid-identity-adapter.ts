import type {
  KycProvider,
  KycProviderConfig,
  KycSession,
  KycStartInput,
  KycStatusResult,
  KycWebhookResult,
  KycStatus,
} from "./types";
import crypto from "crypto";

const PLAID_API_BASE = "https://production.plaid.com";
const PLAID_SANDBOX_BASE = "https://sandbox.plaid.com";

function mapPlaidStatus(plaidStatus: string): KycStatus {
  const statusMap: Record<string, KycStatus> = {
    active: "IN_PROGRESS",
    success: "APPROVED",
    failed: "DECLINED",
    expired: "EXPIRED",
    canceled: "CANCELLED",
    pending_review: "NEEDS_REVIEW",
  };
  return statusMap[plaidStatus.toLowerCase()] || "PENDING";
}

export class PlaidIdentityKycProvider implements KycProvider {
  readonly name = "Plaid Identity";
  readonly type = "plaid_identity" as const;
  private config: KycProviderConfig;

  constructor(config?: Partial<KycProviderConfig>) {
    this.config = {
      provider: "plaid_identity",
      apiKey: config?.apiKey || process.env.PLAID_SECRET,
      templateId: config?.templateId || process.env.PLAID_IDV_TEMPLATE_ID,
      environmentId: config?.environmentId || process.env.PLAID_CLIENT_ID,
      webhookSecret: config?.webhookSecret || process.env.PLAID_WEBHOOK_SECRET,
      environment:
        config?.environment ||
        (process.env.PLAID_ENVIRONMENT as "sandbox" | "production") ||
        "sandbox",
    };
  }

  private getApiBase(): string {
    return this.config.environment === "production"
      ? PLAID_API_BASE
      : PLAID_SANDBOX_BASE;
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
    };
  }

  private getAuthBody(): Record<string, string> {
    return {
      client_id: this.config.environmentId || "",
      secret: this.config.apiKey || "",
    };
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.environmentId);
  }

  async startVerification(input: KycStartInput): Promise<KycSession> {
    const nameParts = `${input.firstName || ""} ${input.lastName || ""}`.trim();
    const response = await fetch(
      `${this.getApiBase()}/identity_verification/create`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...this.getAuthBody(),
          template_id: this.config.templateId,
          gave_consent: true,
          user: {
            client_user_id: input.referenceId,
            email_address: input.email,
            ...(nameParts && {
              name: {
                given_name: input.firstName || "",
                family_name: input.lastName || "",
              },
            }),
          },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Plaid IDV API error:", error);
      throw new Error(
        `Failed to create Plaid identity verification: ${response.status}`,
      );
    }

    const result = await response.json();

    return {
      id: result.id,
      referenceId: input.referenceId,
      status: mapPlaidStatus(result.status),
      sessionUrl: result.shareable_url || undefined,
    };
  }

  async getStatus(sessionId: string): Promise<KycStatusResult> {
    const response = await fetch(
      `${this.getApiBase()}/identity_verification/get`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...this.getAuthBody(),
          identity_verification_id: sessionId,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to get Plaid IDV status: ${response.status}`,
      );
    }

    const result = await response.json();

    return {
      id: result.id,
      referenceId: result.user?.client_user_id || "",
      status: mapPlaidStatus(result.status),
      completedAt: result.completed_at
        ? new Date(result.completed_at)
        : undefined,
      data: {
        steps: result.steps,
        documentary_verification: result.documentary_verification,
      },
    };
  }

  async resumeSession(
    sessionId: string,
  ): Promise<{ sessionToken: string }> {
    const response = await fetch(
      `${this.getApiBase()}/identity_verification/get`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          ...this.getAuthBody(),
          identity_verification_id: sessionId,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to resume Plaid IDV session: ${response.status}`,
      );
    }

    const result = await response.json();
    return {
      sessionToken: result.shareable_url || sessionId,
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn("Plaid webhook secret not configured");
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac("sha256", this.config.webhookSecret)
        .update(payload)
        .digest("hex");

      if (signature.length !== expectedSignature.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(expectedSignature, "hex"),
      );
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: unknown): KycWebhookResult {
    const data = payload as {
      webhook_type: string;
      webhook_code: string;
      identity_verification_id: string;
      environment: string;
    };

    // Map Plaid webhook codes to our status
    const statusFromCode: Record<string, KycStatus> = {
      STEP_UPDATED: "IN_PROGRESS",
      VERIFICATION_COMPLETED: "APPROVED",
      VERIFICATION_FAILED: "DECLINED",
      VERIFICATION_EXPIRED: "EXPIRED",
    };

    return {
      eventName: `${data.webhook_type}.${data.webhook_code}`,
      inquiryId: data.identity_verification_id,
      referenceId: "",
      status: statusFromCode[data.webhook_code] || "PENDING",
      data: data as unknown as Record<string, unknown>,
    };
  }

  getEmbeddedConfig(): { environmentId?: string; templateId?: string } {
    return {
      environmentId: this.config.environmentId,
      templateId: this.config.templateId,
    };
  }
}
