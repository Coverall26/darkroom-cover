import type {
  EmailProvider,
  EmailProviderConfig,
  SendEmailInput,
  SendEmailResult,
  EmailAddress,
} from "./types";
import { Resend } from "resend";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "Resend";
  readonly type = "resend" as const;
  private config: EmailProviderConfig;
  private client: Resend;

  constructor(config?: Partial<EmailProviderConfig>) {
    const domain = config?.domain || process.env.EMAIL_DOMAIN || process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "fundroom.ai";
    this.config = {
      provider: "resend",
      apiKey: config?.apiKey || process.env.RESEND_API_KEY,
      domain,
      defaultFrom: config?.defaultFrom || {
        email: process.env.EMAIL_FROM || `noreply@${domain}`,
        name: process.env.EMAIL_FROM_NAME || "FundRoom.ai",
      },
    };

    this.client = new Resend(this.config.apiKey);
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private formatAddress(address: EmailAddress): string {
    if (address.name) {
      return `${address.name} <${address.email}>`;
    }
    return address.email;
  }

  private formatAddresses(addresses: EmailAddress | EmailAddress[]): string[] {
    const arr = Array.isArray(addresses) ? addresses : [addresses];
    return arr.map((a) => this.formatAddress(a));
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const emailOptions = {
      from: this.formatAddress(input.from),
      to: this.formatAddresses(input.to),
      subject: input.subject,
      ...(input.cc && { cc: this.formatAddresses(input.cc) }),
      ...(input.bcc && { bcc: this.formatAddresses(input.bcc) }),
      ...(input.replyTo && { replyTo: this.formatAddress(input.replyTo) }),
      ...(input.text && { text: input.text }),
      ...(input.html && { html: input.html }),
      ...(input.attachments && {
        attachments: input.attachments.map((a) => ({
          filename: a.filename,
          content: typeof a.content === "string" ? a.content : a.content.toString("base64"),
        })),
      }),
      ...(input.headers && { headers: input.headers }),
      ...(input.tags && {
        tags: Object.entries(input.tags).map(([name, value]) => ({ name, value })),
      }),
    };

    const { data, error } = await this.client.emails.send(emailOptions as Parameters<typeof this.client.emails.send>[0]);

    if (error) {
      console.error("Resend email error:", error);
      return {
        id: "",
        status: "failed",
        timestamp: new Date(),
      };
    }

    return {
      id: data?.id || "",
      status: "sent",
      timestamp: new Date(),
    };
  }

  async sendBatch(inputs: SendEmailInput[]): Promise<SendEmailResult[]> {
    const results: SendEmailResult[] = [];

    for (const input of inputs) {
      const result = await this.send(input);
      results.push(result);
    }

    return results;
  }

  getDefaultFrom(): EmailAddress {
    const domain = this.config.domain || "fundroom.ai";
    return this.config.defaultFrom || {
      email: process.env.EMAIL_FROM || `noreply@${domain}`,
      name: process.env.EMAIL_FROM_NAME || "FundRoom.ai",
    };
  }
}
