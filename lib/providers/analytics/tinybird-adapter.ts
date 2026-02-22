import type {
  AnalyticsProvider,
  AnalyticsProviderConfig,
  AnalyticsEvent,
  AnalyticsQuery,
  AnalyticsQueryResult,
} from "./types";

export class TinybirdAnalyticsProvider implements AnalyticsProvider {
  readonly name = "Tinybird";
  readonly type = "tinybird" as const;
  private config: AnalyticsProviderConfig;

  constructor(config?: Partial<AnalyticsProviderConfig>) {
    this.config = {
      provider: "tinybird",
      apiKey: config?.apiKey || process.env.TINYBIRD_TOKEN,
      host: config?.host || process.env.TINYBIRD_HOST || "https://api.us-west-2.aws.tinybird.co",
      datasource: config?.datasource || process.env.TINYBIRD_DATASOURCE,
    };
  }

  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async track(event: AnalyticsEvent): Promise<void> {
    if (!this.isConfigured()) {
      console.warn("Tinybird is not configured, skipping event tracking");
      return;
    }

    const datasource = this.config.datasource || "events";
    const url = `${this.config.host}/v0/events?name=${datasource}`;

    const payload = {
      timestamp: (event.timestamp || new Date()).toISOString(),
      event_name: event.name,
      distinct_id: event.distinctId || "anonymous",
      ...event.properties,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error("Tinybird track error:", await response.text());
      }
    } catch (error) {
      console.error("Tinybird track error:", error);
    }
  }

  async trackBatch(events: AnalyticsEvent[]): Promise<void> {
    if (!this.isConfigured()) {
      console.warn("Tinybird is not configured, skipping batch event tracking");
      return;
    }

    const datasource = this.config.datasource || "events";
    const url = `${this.config.host}/v0/events?name=${datasource}`;

    const ndjson = events
      .map((event) =>
        JSON.stringify({
          timestamp: (event.timestamp || new Date()).toISOString(),
          event_name: event.name,
          distinct_id: event.distinctId || "anonymous",
          ...event.properties,
        })
      )
      .join("\n");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.getHeaders(),
          "Content-Type": "application/x-ndjson",
        },
        body: ndjson,
      });

      if (!response.ok) {
        console.error("Tinybird batch track error:", await response.text());
      }
    } catch (error) {
      console.error("Tinybird batch track error:", error);
    }
  }

  async query(query: AnalyticsQuery): Promise<AnalyticsQueryResult> {
    if (!this.isConfigured()) {
      throw new Error("Tinybird is not configured");
    }

    const params = new URLSearchParams();
    if (query.params) {
      for (const [key, value] of Object.entries(query.params)) {
        params.append(key, String(value));
      }
    }

    const url = `${this.config.host}/v0/pipes/${query.endpoint}.json?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Tinybird query error: ${await response.text()}`);
    }

    const result = await response.json();

    return {
      data: result.data || [],
      meta: {
        columns: result.meta?.map((m: { name: string }) => m.name),
        rows: result.rows,
      },
    };
  }

  async identify(distinctId: string, properties: Record<string, unknown>): Promise<void> {
    await this.track({
      name: "$identify",
      distinctId,
      properties: {
        $set: properties,
      },
    });
  }
}
