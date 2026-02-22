export type KycProviderType =
  | "persona"
  | "plaid_identity"
  | "parallel_markets"
  | "verify_investor"
  | "jumio"
  | "onfido"
  | "sumsub";

export type KycStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "APPROVED"
  | "DECLINED"
  | "NEEDS_REVIEW"
  | "EXPIRED"
  | "CANCELLED";

export interface KycSession {
  id: string;
  referenceId: string;
  status: KycStatus;
  sessionUrl?: string;
  sessionToken?: string;
  expiresAt?: Date;
}

export interface KycStartInput {
  referenceId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  redirectUri?: string;
}

export interface KycStatusResult {
  id: string;
  referenceId: string;
  status: KycStatus;
  completedAt?: Date;
  data?: Record<string, unknown>;
}

export interface KycWebhookResult {
  eventName: string;
  inquiryId: string;
  referenceId: string;
  status: KycStatus;
  data: Record<string, unknown>;
}

export interface KycProvider {
  readonly name: string;
  readonly type: KycProviderType;

  isConfigured(): boolean;

  startVerification(input: KycStartInput): Promise<KycSession>;

  getStatus(sessionId: string): Promise<KycStatusResult>;

  resumeSession(sessionId: string): Promise<{ sessionToken: string }>;

  verifyWebhookSignature(payload: string, signature: string): boolean;

  parseWebhookEvent(payload: unknown): KycWebhookResult;

  getEmbeddedConfig(): {
    environmentId?: string;
    templateId?: string;
  };
}

export interface KycProviderConfig {
  provider: KycProviderType;
  apiKey?: string;
  templateId?: string;
  environmentId?: string;
  webhookSecret?: string;
  environment?: "sandbox" | "production";
}
