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

const VI_API_BASE = "https://api.verifyinvestor.com/api/v1";
const VI_SANDBOX_BASE = "https://sandbox.verifyinvestor.com/api/v1";

function mapVerifyInvestorStatus(viStatus: string): KycStatus {
  const statusMap: Record<string, KycStatus> = {
    pending: "PENDING",
    in_review: "IN_PROGRESS",
    under_review: "IN_PROGRESS",
    approved: "APPROVED",
    verified: "APPROVED",
    denied: "DECLINED",
    rejected: "DECLINED",
    expired: "EXPIRED",
    cancelled: "CANCELLED",
  };
  return statusMap[viStatus.toLowerCase()] || "PENDING";
}

export class VerifyInvestorKycProvider implements KycProvider {
  readonly name = "Verify Investor";
  readonly type = "verify_investor" as const;
  private config: KycProviderConfig;

  constructor(config?: Partial<KycProviderConfig>) {
    this.config = {
      provider: "verify_investor",
      apiKey: config?.apiKey || process.env.VERIFY_INVESTOR_API_KEY,
      templateId: config?.templateId || process.env.VERIFY_INVESTOR_OFFERING_ID,
      environmentId:
        config?.environmentId || process.env.VERIFY_INVESTOR_CLIENT_ID,
      webhookSecret:
        config?.webhookSecret || process.env.VERIFY_INVESTOR_WEBHOOK_SECRET,
      environment:
        config?.environment ||
        (process.env.VERIFY_INVESTOR_ENVIRONMENT as
          | "sandbox"
          | "production") ||
        "sandbox",
    };
  }

  private getApiBase(): string {
    return this.config.environment === "production"
      ? VI_API_BASE
      : VI_SANDBOX_BASE;
  }

  private getHeaders(): Record<string, string> {
    if (!this.config.apiKey) {
      throw new Error("Verify Investor API key is not configured");
    }
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.templateId);
  }

  async startVerification(input: KycStartInput): Promise<KycSession> {
    const response = await fetch(
      `${this.getApiBase()}/verifications`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          offering_id: this.config.templateId,
          investor: {
            email: input.email,
            first_name: input.firstName || "",
            last_name: input.lastName || "",
            reference_id: input.referenceId,
          },
          redirect_url: input.redirectUri,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Verify Investor API error:", error);
      throw new Error(
        `Failed to create Verify Investor verification: ${response.status}`,
      );
    }

    const result = await response.json();

    return {
      id: result.id || result.verification_id,
      referenceId: input.referenceId,
      status: mapVerifyInvestorStatus(result.status || "pending"),
      sessionUrl: result.verification_url || result.link || undefined,
    };
  }

  async getStatus(sessionId: string): Promise<KycStatusResult> {
    const response = await fetch(
      `${this.getApiBase()}/verifications/${sessionId}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to get Verify Investor status: ${response.status}`,
      );
    }

    const result = await response.json();

    return {
      id: result.id || result.verification_id,
      referenceId: result.investor?.reference_id || "",
      status: mapVerifyInvestorStatus(result.status || ""),
      completedAt: result.verified_at
        ? new Date(result.verified_at)
        : undefined,
      data: {
        accreditation_method: result.accreditation_method,
        verification_type: result.verification_type,
        letter_url: result.letter_url,
        expires_at: result.expires_at,
      },
    };
  }

  async resumeSession(
    sessionId: string,
  ): Promise<{ sessionToken: string }> {
    const status = await this.getStatus(sessionId);
    return {
      sessionToken:
        (status.data?.verification_url as string) || sessionId,
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn("Verify Investor webhook secret not configured");
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
      event_type: string;
      verification_id: string;
      reference_id: string;
      status: string;
      data: Record<string, unknown>;
    };

    return {
      eventName: data.event_type,
      inquiryId: data.verification_id,
      referenceId: data.reference_id || "",
      status: mapVerifyInvestorStatus(data.status || ""),
      data: data.data || {},
    };
  }

  getEmbeddedConfig(): { environmentId?: string; templateId?: string } {
    return {
      environmentId: this.config.environmentId,
      templateId: this.config.templateId,
    };
  }
}
