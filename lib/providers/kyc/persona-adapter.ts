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

const PERSONA_API_BASE = "https://api.withpersona.com/api/v1";

interface PersonaInquiry {
  id: string;
  type: string;
  attributes: {
    status: string;
    "reference-id": string;
    "created-at": string;
    "started-at"?: string;
    "completed-at"?: string;
    "failed-at"?: string;
    "redacted-at"?: string;
    "expired-at"?: string;
    fields?: Record<string, unknown>;
  };
}

function mapPersonaStatus(personaStatus: string): KycStatus {
  const statusMap: Record<string, KycStatus> = {
    created: "PENDING",
    pending: "PENDING",
    started: "IN_PROGRESS",
    completed: "APPROVED",
    approved: "APPROVED",
    declined: "DECLINED",
    failed: "DECLINED",
    expired: "EXPIRED",
    needs_review: "NEEDS_REVIEW",
  };
  return statusMap[personaStatus.toLowerCase()] || "PENDING";
}

export class PersonaKycProvider implements KycProvider {
  readonly name = "Persona";
  readonly type = "persona" as const;
  private config: KycProviderConfig;

  constructor(config?: Partial<KycProviderConfig>) {
    this.config = {
      provider: "persona",
      apiKey: config?.apiKey || process.env.PERSONA_API_KEY,
      templateId: config?.templateId || process.env.PERSONA_TEMPLATE_ID,
      environmentId: config?.environmentId || process.env.PERSONA_ENVIRONMENT_ID,
      webhookSecret: config?.webhookSecret || process.env.PERSONA_WEBHOOK_SECRET,
      environment: config?.environment || 
        (process.env.PERSONA_ENVIRONMENT as "sandbox" | "production") || "sandbox",
    };
  }

  private getHeaders(): Record<string, string> {
    if (!this.config.apiKey) {
      throw new Error("Persona API key is not configured");
    }
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      "Persona-Version": "2023-01-05",
      "Key-Inflection": "camel",
    };
  }

  isConfigured(): boolean {
    return !!(this.config.apiKey && this.config.templateId);
  }

  async startVerification(input: KycStartInput): Promise<KycSession> {
    if (!this.config.templateId) {
      throw new Error("Persona template ID is required");
    }

    const response = await fetch(`${PERSONA_API_BASE}/inquiries`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        data: {
          attributes: {
            "inquiry-template-id": this.config.templateId,
            "reference-id": input.referenceId,
            "redirect-uri": input.redirectUri,
            fields: {
              "email-address": input.email,
              ...(input.firstName && { "name-first": input.firstName }),
              ...(input.lastName && { "name-last": input.lastName }),
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Persona API error:", error);
      throw new Error(`Failed to create Persona inquiry: ${response.status}`);
    }

    const result = await response.json();
    const inquiry = result.data as PersonaInquiry;

    return {
      id: inquiry.id,
      referenceId: inquiry.attributes["reference-id"],
      status: mapPersonaStatus(inquiry.attributes.status),
    };
  }

  async getStatus(inquiryId: string): Promise<KycStatusResult> {
    const response = await fetch(`${PERSONA_API_BASE}/inquiries/${inquiryId}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get Persona inquiry: ${response.status}`);
    }

    const result = await response.json();
    const inquiry = result.data as PersonaInquiry;

    return {
      id: inquiry.id,
      referenceId: inquiry.attributes["reference-id"],
      status: mapPersonaStatus(inquiry.attributes.status),
      completedAt: inquiry.attributes["completed-at"]
        ? new Date(inquiry.attributes["completed-at"])
        : undefined,
      data: inquiry.attributes.fields,
    };
  }

  async resumeSession(sessionId: string): Promise<{ sessionToken: string }> {
    const response = await fetch(
      `${PERSONA_API_BASE}/inquiries/${sessionId}/resume`,
      {
        method: "POST",
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to resume Persona inquiry: ${response.status}`);
    }

    const result = await response.json();
    return {
      sessionToken: result.meta?.["session-token"] || "",
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn("Persona webhook secret not configured");
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
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: unknown): KycWebhookResult {
    const data = payload as {
      data: {
        attributes: {
          name: string;
          payload: {
            data: {
              id: string;
              attributes: Record<string, unknown>;
            };
          };
        };
      };
    };

    const event = data.data.attributes;
    const inquiry = event.payload.data;

    return {
      eventName: event.name,
      inquiryId: inquiry.id,
      referenceId: (inquiry.attributes["reference-id"] as string) || "",
      status: mapPersonaStatus((inquiry.attributes.status as string) || ""),
      data: inquiry.attributes,
    };
  }

  getEmbeddedConfig(): { environmentId?: string; templateId?: string } {
    return {
      environmentId: this.config.environmentId,
      templateId: this.config.templateId,
    };
  }
}
