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

const PM_API_BASE = "https://api.parallelmarkets.com/v1";
const PM_SANDBOX_BASE = "https://demo-api.parallelmarkets.com/v1";

function mapParallelMarketsStatus(pmStatus: string): KycStatus {
  const statusMap: Record<string, KycStatus> = {
    pending: "PENDING",
    in_progress: "IN_PROGRESS",
    approved: "APPROVED",
    completed: "APPROVED",
    denied: "DECLINED",
    expired: "EXPIRED",
    needs_review: "NEEDS_REVIEW",
  };
  return statusMap[pmStatus.toLowerCase()] || "PENDING";
}

export class ParallelMarketsKycProvider implements KycProvider {
  readonly name = "Parallel Markets";
  readonly type = "parallel_markets" as const;
  private config: KycProviderConfig;

  constructor(config?: Partial<KycProviderConfig>) {
    this.config = {
      provider: "parallel_markets",
      apiKey: config?.apiKey || process.env.PARALLEL_MARKETS_API_KEY,
      templateId: config?.templateId || process.env.PARALLEL_MARKETS_BUSINESS_ID,
      environmentId:
        config?.environmentId || process.env.PARALLEL_MARKETS_CLIENT_ID,
      webhookSecret:
        config?.webhookSecret || process.env.PARALLEL_MARKETS_WEBHOOK_SECRET,
      environment:
        config?.environment ||
        (process.env.PARALLEL_MARKETS_ENVIRONMENT as
          | "sandbox"
          | "production") ||
        "sandbox",
    };
  }

  private getApiBase(): string {
    return this.config.environment === "production"
      ? PM_API_BASE
      : PM_SANDBOX_BASE;
  }

  private getHeaders(): Record<string, string> {
    if (!this.config.apiKey) {
      throw new Error("Parallel Markets API key is not configured");
    }
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.environmentId);
  }

  async startVerification(input: KycStartInput): Promise<KycSession> {
    const response = await fetch(
      `${this.getApiBase()}/accreditations`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          type: "individual",
          individual: {
            email: input.email,
            first_name: input.firstName || "",
            last_name: input.lastName || "",
          },
          reference_id: input.referenceId,
          redirect_url: input.redirectUri,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Parallel Markets API error:", error);
      throw new Error(
        `Failed to create Parallel Markets verification: ${response.status}`,
      );
    }

    const result = await response.json();

    return {
      id: result.id,
      referenceId: input.referenceId,
      status: mapParallelMarketsStatus(result.status),
      sessionUrl: result.verification_url || undefined,
    };
  }

  async getStatus(sessionId: string): Promise<KycStatusResult> {
    const response = await fetch(
      `${this.getApiBase()}/accreditations/${sessionId}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to get Parallel Markets status: ${response.status}`,
      );
    }

    const result = await response.json();

    return {
      id: result.id,
      referenceId: result.reference_id || "",
      status: mapParallelMarketsStatus(result.status),
      completedAt: result.completed_at
        ? new Date(result.completed_at)
        : undefined,
      data: {
        accreditation_type: result.accreditation_type,
        evidence_type: result.evidence_type,
        expires_at: result.expires_at,
      },
    };
  }

  async resumeSession(
    sessionId: string,
  ): Promise<{ sessionToken: string }> {
    // Parallel Markets uses a redirect URL, not a session token
    const status = await this.getStatus(sessionId);
    return {
      sessionToken:
        (status.data?.verification_url as string) || sessionId,
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn("Parallel Markets webhook secret not configured");
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
      event: string;
      accreditation_id: string;
      reference_id: string;
      status: string;
      data: Record<string, unknown>;
    };

    return {
      eventName: data.event,
      inquiryId: data.accreditation_id,
      referenceId: data.reference_id || "",
      status: mapParallelMarketsStatus(data.status || ""),
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
