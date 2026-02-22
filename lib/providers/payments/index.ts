import type { PaymentsProvider, PaymentsProviderConfig, PaymentsProviderType } from "./types";
import { PlaidPaymentsProvider } from "./plaid-adapter";

export * from "./types";
export { PlaidPaymentsProvider } from "./plaid-adapter";

let cachedProvider: PaymentsProvider | null = null;
let cachedProviderType: PaymentsProviderType | null = null;

function getPaymentsConfigFromEnv(): PaymentsProviderConfig {
  const provider = (process.env.PAYMENTS_PROVIDER || "plaid") as PaymentsProviderType;

  return {
    provider,
    clientId: process.env.PLAID_CLIENT_ID,
    secret: process.env.PLAID_SECRET,
    environment:
      (process.env.PLAID_ENV === "production" ? "production" : "sandbox"),
    webhookUrl: process.env.PLAID_WEBHOOK_URL,
  };
}

export function createPaymentsProvider(config?: PaymentsProviderConfig): PaymentsProvider {
  const providerType = config?.provider || "plaid";

  switch (providerType) {
    case "plaid":
      if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
        throw new Error("Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET to enable.");
      }
      return new PlaidPaymentsProvider(config);
    case "stripe":
    case "dwolla":
    case "modern_treasury":
      throw new Error(`Payments provider "${providerType}" is not yet implemented`);
    default:
      throw new Error(`Unsupported payments provider: ${providerType}`);
  }
}

export function getPaymentsProvider(): PaymentsProvider {
  const config = getPaymentsConfigFromEnv();

  if (!cachedProvider || cachedProviderType !== config.provider) {
    cachedProvider = createPaymentsProvider(config);
    cachedProviderType = config.provider;
  }

  return cachedProvider;
}

export function resetPaymentsProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}
