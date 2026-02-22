import type { EmailProvider, EmailProviderConfig, EmailProviderType } from "./types";
import { ResendEmailProvider } from "./resend-adapter";

export * from "./types";
export { ResendEmailProvider } from "./resend-adapter";

let cachedProvider: EmailProvider | null = null;
let cachedProviderType: EmailProviderType | null = null;

function getEmailConfigFromEnv(): EmailProviderConfig {
  const provider = (process.env.EMAIL_PROVIDER || "resend") as EmailProviderType;

  return {
    provider,
    apiKey: process.env.RESEND_API_KEY,
    domain: process.env.EMAIL_DOMAIN || "fundroom.ai",
    defaultFrom: {
      email: process.env.EMAIL_FROM || "noreply@fundroom.ai",
      name: process.env.EMAIL_FROM_NAME || "FundRoom.ai",
    },
  };
}

export function createEmailProvider(config?: EmailProviderConfig): EmailProvider {
  const providerType = config?.provider || "resend";

  switch (providerType) {
    case "resend":
      return new ResendEmailProvider(config);
    case "sendgrid":
    case "postmark":
    case "ses":
      throw new Error(`Email provider "${providerType}" is not yet implemented`);
    default:
      throw new Error(`Unsupported email provider: ${providerType}`);
  }
}

export function getEmailProvider(): EmailProvider {
  const config = getEmailConfigFromEnv();

  if (!cachedProvider || cachedProviderType !== config.provider) {
    cachedProvider = createEmailProvider(config);
    cachedProviderType = config.provider;
  }

  return cachedProvider;
}

export function resetEmailProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}
