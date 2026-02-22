export type AnalyticsProviderType = "tinybird" | "posthog" | "mixpanel" | "amplitude";

export interface AnalyticsEvent {
  name: string;
  timestamp?: Date;
  distinctId?: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsQuery {
  endpoint: string;
  params?: Record<string, string | number | boolean>;
}

export interface AnalyticsQueryResult {
  data: unknown[];
  meta?: {
    columns?: string[];
    rows?: number;
  };
}

export interface AnalyticsProvider {
  readonly name: string;
  readonly type: AnalyticsProviderType;

  isConfigured(): boolean;

  track(event: AnalyticsEvent): Promise<void>;

  trackBatch(events: AnalyticsEvent[]): Promise<void>;

  query(query: AnalyticsQuery): Promise<AnalyticsQueryResult>;

  identify(distinctId: string, properties: Record<string, unknown>): Promise<void>;
}

export interface AnalyticsProviderConfig {
  provider: AnalyticsProviderType;
  apiKey?: string;
  host?: string;
  datasource?: string;
}
