import type { EsignProvider, EsignProviderConfig, EsignProviderType } from "./types";
import { FundRoomSignProvider } from "./fundroom-sign-adapter";

export * from "./types";
export { FundRoomSignProvider } from "./fundroom-sign-adapter";

let cachedProvider: EsignProvider | null = null;
let cachedProviderType: EsignProviderType | null = null;

function getEsignConfigFromEnv(): EsignProviderConfig {
  const provider = (process.env.ESIGN_PROVIDER || "fundroomsign") as EsignProviderType;

  return {
    provider,
    apiKey: process.env.ESIGN_API_KEY,
    clientId: process.env.ESIGN_CLIENT_ID,
    webhookSecret: process.env.ESIGN_WEBHOOK_SECRET,
    environment:
      (process.env.ESIGN_ENVIRONMENT as "sandbox" | "production") || "production",
  };
}

export function createEsignProvider(config?: EsignProviderConfig): EsignProvider {
  const providerType = config?.provider || "fundroomsign";

  switch (providerType) {
    case "fundroomsign":
      return new FundRoomSignProvider(config);
    case "dropboxsign":
    case "docusign":
    case "pandadoc":
      throw new Error(`E-sign provider "${providerType}" is not yet implemented`);
    default:
      throw new Error(`Unsupported e-sign provider: ${providerType}`);
  }
}

export function getEsignProvider(): EsignProvider {
  const config = getEsignConfigFromEnv();

  if (!cachedProvider || cachedProviderType !== config.provider) {
    cachedProvider = createEsignProvider(config);
    cachedProviderType = config.provider;
  }

  return cachedProvider;
}

export function resetEsignProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}
