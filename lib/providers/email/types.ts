export type EmailProviderType = "resend" | "sendgrid" | "postmark" | "ses";

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailInput {
  from: EmailAddress;
  to: EmailAddress | EmailAddress[];
  cc?: EmailAddress | EmailAddress[];
  bcc?: EmailAddress | EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  tags?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  id: string;
  status: "sent" | "queued" | "failed";
  timestamp: Date;
}

export interface EmailProvider {
  readonly name: string;
  readonly type: EmailProviderType;

  isConfigured(): boolean;

  send(input: SendEmailInput): Promise<SendEmailResult>;

  sendBatch(inputs: SendEmailInput[]): Promise<SendEmailResult[]>;

  getDefaultFrom(): EmailAddress;
}

export interface EmailProviderConfig {
  provider: EmailProviderType;
  apiKey?: string;
  domain?: string;
  defaultFrom?: EmailAddress;
}
