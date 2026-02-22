import type { AnalyticsProvider, AnalyticsProviderConfig, AnalyticsProviderType } from "./types";
import { TinybirdAnalyticsProvider } from "./tinybird-adapter";

export * from "./types";
export { TinybirdAnalyticsProvider } from "./tinybird-adapter";

let cachedProvider: AnalyticsProvider | null = null;
let cachedProviderType: AnalyticsProviderType | null = null;

function getAnalyticsConfigFromEnv(): AnalyticsProviderConfig {
  const provider = (process.env.ANALYTICS_PROVIDER || "tinybird") as AnalyticsProviderType;

  return {
    provider,
    apiKey: process.env.TINYBIRD_TOKEN,
    host: process.env.TINYBIRD_HOST || "https://api.tinybird.co",
    datasource: process.env.TINYBIRD_DATASOURCE,
  };
}

export function createAnalyticsProvider(config?: AnalyticsProviderConfig): AnalyticsProvider {
  const providerType = config?.provider || "tinybird";

  switch (providerType) {
    case "tinybird":
      return new TinybirdAnalyticsProvider(config);
    case "posthog":
    case "mixpanel":
    case "amplitude":
      throw new Error(`Analytics provider "${providerType}" is not yet implemented`);
    default:
      throw new Error(`Unsupported analytics provider: ${providerType}`);
  }
}

export function getAnalyticsProvider(): AnalyticsProvider {
  const config = getAnalyticsConfigFromEnv();

  if (!cachedProvider || cachedProviderType !== config.provider) {
    cachedProvider = createAnalyticsProvider(config);
    cachedProviderType = config.provider;
  }

  return cachedProvider;
}

export function resetAnalyticsProvider(): void {
  cachedProvider = null;
  cachedProviderType = null;
}
