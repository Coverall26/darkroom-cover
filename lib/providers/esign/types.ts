export type EsignProviderType = "fundroomsign" | "dropboxsign" | "docusign" | "pandadoc";

export type EnvelopeStatus =
  | "CREATED"
  | "SENT"
  | "DELIVERED"
  | "SIGNED"
  | "COMPLETED"
  | "DECLINED"
  | "VOIDED"
  | "EXPIRED";

export interface Signer {
  id: string;
  email: string;
  name: string;
  role?: string;
  order?: number;
}

export interface SignatureField {
  type: "signature" | "initials" | "date" | "text" | "checkbox";
  pageNumber: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  required?: boolean;
  signerId: string;
}

export interface CreateEnvelopeInput {
  documentId: string;
  documentUrl?: string;
  documentBuffer?: Buffer;
  title: string;
  message?: string;
  signers: Signer[];
  fields?: SignatureField[];
  expiresAt?: Date;
  callbackUrl?: string;
}

export interface Envelope {
  id: string;
  providerEnvelopeId: string;
  status: EnvelopeStatus;
  title: string;
  signers: SignerStatus[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface SignerStatus {
  id: string;
  email: string;
  name: string;
  status: "pending" | "signed" | "declined";
  signedAt?: Date;
  signUrl?: string;
}

export interface EsignWebhookResult {
  eventType: string;
  envelopeId: string;
  status: EnvelopeStatus;
  signers: SignerStatus[];
  completedAt?: Date;
  data: Record<string, unknown>;
}

export interface EsignProvider {
  readonly name: string;
  readonly type: EsignProviderType;

  isConfigured(): boolean;

  createEnvelope(input: CreateEnvelopeInput): Promise<Envelope>;

  getEnvelope(envelopeId: string): Promise<Envelope>;

  getSignUrl(envelopeId: string, signerId: string): Promise<string>;

  voidEnvelope(envelopeId: string, reason?: string): Promise<boolean>;

  downloadDocument(envelopeId: string): Promise<Buffer>;

  verifyWebhookSignature(payload: string, signature: string): boolean;

  parseWebhookEvent(payload: unknown): EsignWebhookResult;
}

export interface EsignProviderConfig {
  provider: EsignProviderType;
  apiKey?: string;
  clientId?: string;
  webhookSecret?: string;
  environment?: "sandbox" | "production";
}
