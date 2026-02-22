/**
 * FundRoom Sign - Self-hosted E-Signature Provider
 *
 * Unlike external providers (DocuSign, DropboxSign), FundRoom Sign is self-hosted
 * and database-driven. This adapter provides the interface contract but delegates
 * actual envelope/document storage to the application's database layer.
 *
 * Key differences from external providers:
 * - Envelopes are stored in PostgreSQL, not an external API
 * - Documents are stored via StorageProvider (Replit Object Storage)
 * - getEnvelope() throws because caller should query database directly
 * - downloadDocument() throws because caller should use StorageProvider
 *
 * The adapter is primarily used for:
 * - Generating envelope IDs and sign URLs
 * - Webhook signature verification
 * - Status mapping to provider-agnostic types
 */
import type {
  EsignProvider,
  EsignProviderConfig,
  CreateEnvelopeInput,
  Envelope,
  EnvelopeStatus,
  SignerStatus,
  EsignWebhookResult,
} from "./types";
import crypto from "crypto";

function mapStatus(status: string): EnvelopeStatus {
  const statusMap: Record<string, EnvelopeStatus> = {
    DRAFT: "CREATED",
    PENDING: "SENT",
    SENT: "SENT",
    VIEWED: "DELIVERED",
    PARTIALLY_SIGNED: "DELIVERED",
    SIGNED: "SIGNED",
    COMPLETED: "COMPLETED",
    DECLINED: "DECLINED",
    VOIDED: "VOIDED",
    EXPIRED: "EXPIRED",
  };
  return statusMap[status.toUpperCase()] || "CREATED";
}

function mapSignerStatus(status: string): "pending" | "signed" | "declined" {
  const statusMap: Record<string, "pending" | "signed" | "declined"> = {
    PENDING: "pending",
    SENT: "pending",
    VIEWED: "pending",
    SIGNED: "signed",
    DECLINED: "declined",
  };
  return statusMap[status.toUpperCase()] || "pending";
}

export class FundRoomSignProvider implements EsignProvider {
  readonly name = "FundRoom Sign";
  readonly type = "fundroomsign" as const;
  private config: EsignProviderConfig;

  constructor(config?: Partial<EsignProviderConfig>) {
    this.config = {
      provider: "fundroomsign",
      apiKey: config?.apiKey || process.env.ESIGN_API_KEY,
      webhookSecret: config?.webhookSecret || process.env.ESIGN_WEBHOOK_SECRET,
      environment: config?.environment || "production",
    };
  }

  isConfigured(): boolean {
    return true;
  }

  getConfig(): { webhookSecret?: string } {
    return { webhookSecret: this.config.webhookSecret };
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<Envelope> {
    const envelopeId = crypto.randomUUID();
    const now = new Date();

    const signerStatuses: SignerStatus[] = input.signers.map((signer) => ({
      id: signer.id,
      email: signer.email,
      name: signer.name,
      status: "pending" as const,
    }));

    return {
      id: envelopeId,
      providerEnvelopeId: envelopeId,
      status: "CREATED",
      title: input.title,
      signers: signerStatuses,
      createdAt: now,
      expiresAt: input.expiresAt,
    };
  }

  async getEnvelope(envelopeId: string): Promise<Envelope> {
    throw new Error(
      `Envelope ${envelopeId} not found. Use database to retrieve envelope data.`
    );
  }

  async getSignUrl(envelopeId: string, signerId: string): Promise<string> {
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
    return `${baseUrl}/sign/${envelopeId}?signer=${signerId}`;
  }

  async voidEnvelope(_envelopeId: string, _reason?: string): Promise<boolean> {
    return true;
  }

  async downloadDocument(_envelopeId: string): Promise<Buffer> {
    throw new Error(
      "Document download should be handled through storage provider"
    );
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn("E-sign webhook secret not configured - signature verification skipped");
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

  parseWebhookEvent(payload: unknown): EsignWebhookResult {
    const data = payload as {
      eventType: string;
      envelopeId: string;
      status: string;
      signers?: Array<{
        id: string;
        email: string;
        name: string;
        status: string;
        signedAt?: string;
      }>;
      completedAt?: string;
    };

    return {
      eventType: data.eventType,
      envelopeId: data.envelopeId,
      status: mapStatus(data.status),
      signers: (data.signers || []).map((s) => ({
        id: s.id,
        email: s.email,
        name: s.name,
        status: mapSignerStatus(s.status),
        signedAt: s.signedAt ? new Date(s.signedAt) : undefined,
      })),
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      data: data as Record<string, unknown>,
    };
  }
}
