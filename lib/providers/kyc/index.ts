import type { KycProvider, KycProviderConfig, KycProviderType } from "./types";
import { PersonaKycProvider } from "./persona-adapter";
import { PlaidIdentityKycProvider } from "./plaid-identity-adapter";
import { ParallelMarketsKycProvider } from "./parallel-markets-adapter";
import { VerifyInvestorKycProvider } from "./verify-investor-adapter";

export * from "./types";
export { PersonaKycProvider } from "./persona-adapter";
export { PlaidIdentityKycProvider } from "./plaid-identity-adapter";
export { ParallelMarketsKycProvider } from "./parallel-markets-adapter";
export { VerifyInvestorKycProvider } from "./verify-investor-adapter";

let cachedProvider: KycProvider | null = null;
let cachedProviderType: KycProviderType | null = null;

/** Maps AccreditationAck.kycProvider DB values to our provider type */
export const KYC_PROVIDER_DB_MAP: Record<string, KycProviderType> = {
  PERSONA: "persona",
  PLAID: "plaid_identity",
  PARALLEL_MARKETS: "parallel_markets",
  VERIFY_INVESTOR: "verify_investor",
};

/** Reverse map: provider type → DB enum value */
export const KYC_PROVIDER_TO_DB: Record<KycProviderType, string> = {
  persona: "PERSONA",
  plaid_identity: "PLAID",
  parallel_markets: "PARALLEL_MARKETS",
  verify_investor: "VERIFY_INVESTOR",
  jumio: "JUMIO",
  onfido: "ONFIDO",
  sumsub: "SUMSUB",
};

function getKycConfigFromEnv(): KycProviderConfig {
  const provider = (process.env.KYC_PROVIDER || "persona") as KycProviderType;

  switch (provider) {
    case "plaid_identity":
      return {
        provider,
        apiKey: process.env.PLAID_SECRET,
        templateId: process.env.PLAID_IDV_TEMPLATE_ID,
        environmentId: process.env.PLAID_CLIENT_ID,
        webhookSecret: process.env.PLAID_WEBHOOK_SECRET,
        environment:
          (process.env.PLAID_ENVIRONMENT as "sandbox" | "production") ||
          "sandbox",
      };
    case "parallel_markets":
      return {
        provider,
        apiKey: process.env.PARALLEL_MARKETS_API_KEY,
        templateId: process.env.PARALLEL_MARKETS_BUSINESS_ID,
        environmentId: process.env.PARALLEL_MARKETS_CLIENT_ID,
        webhookSecret: process.env.PARALLEL_MARKETS_WEBHOOK_SECRET,
        environment:
          (process.env.PARALLEL_MARKETS_ENVIRONMENT as
            | "sandbox"
            | "production") || "sandbox",
      };
    case "verify_investor":
      return {
        provider,
        apiKey: process.env.VERIFY_INVESTOR_API_KEY,
        templateId: process.env.VERIFY_INVESTOR_OFFERING_ID,
        environmentId: process.env.VERIFY_INVESTOR_CLIENT_ID,
        webhookSecret: process.env.VERIFY_INVESTOR_WEBHOOK_SECRET,
        environment:
          (process.env.VERIFY_INVESTOR_ENVIRONMENT as
            | "sandbox"
            | "production") || "sandbox",
      };
    default:
      return {
        provider,
        apiKey: process.env.PERSONA_API_KEY,
        templateId: process.env.PERSONA_TEMPLATE_ID,
        environmentId: process.env.PERSONA_ENVIRONMENT_ID,
        webhookSecret: process.env.PERSONA_WEBHOOK_SECRET,
        environment:
          (process.env.PERSONA_ENVIRONMENT as "sandbox" | "production") ||
          "sandbox",
      };
  }
}

export function createKycProvider(config?: KycProviderConfig): KycProvider {
  const providerType = config?.provider || "persona";

  switch (providerType) {
    case "persona":
      return new PersonaKycProvider(config);
    case "plaid_identity":
      return new PlaidIdentityKycProvider(config);
    case "parallel_markets":
      return new ParallelMarketsKycProvider(config);
    case "verify_investor":
      return new VerifyInvestorKycProvider(config);
    case "jumio":
    case "onfido":
    case "sumsub":
      throw new Error(`KYC provider "${providerType}" is not yet implemented`);
    default:
      throw new Error(`Unsupported KYC provider: ${providerType}`);
  }
}

export function getKycProvider(): KycProvider {
  const config = getKycConfigFromEnv();

  if (!cachedProvider || cachedProviderType !== config.provider) {
    cachedProvider = createKycProvider(config);
    cachedProviderType = config.provider;
  }

  return cachedProvider;
}

export function resetKycProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}
