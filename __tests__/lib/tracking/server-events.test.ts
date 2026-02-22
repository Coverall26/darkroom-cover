/**
 * Tests for server-events module.
 *
 * The module uses @chronark/zod-bird SDK and `import "server-only"`.
 * We mock both to test the publishServerEvent function.
 */

// Mock "server-only" (it's a no-op guard that throws at import in client bundles)
jest.mock("server-only", () => ({}));

// Mock @chronark/zod-bird
const mockIngest = jest.fn().mockResolvedValue(undefined);
const mockBuildIngestEndpoint = jest.fn().mockReturnValue(mockIngest);

jest.mock("@chronark/zod-bird", () => ({
  Tinybird: jest.fn().mockImplementation(() => ({
    buildIngestEndpoint: mockBuildIngestEndpoint,
  })),
}));

// Store original env
const originalEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.TINYBIRD_TOKEN;
  delete process.env.TINYBIRD_HOST;
});

afterAll(() => {
  process.env = originalEnv;
});

describe("server-events", () => {
  describe("publishServerEvent", () => {
    it("logs to console when TINYBIRD_TOKEN is not set", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await publishServerEvent("funnel_signup_completed", { userId: "u1" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[FUNNEL] funnel_signup_completed",
        expect.objectContaining({
          event_name: "funnel_signup_completed",
          userId: "u1",
          timestamp: expect.any(String),
        }),
      );
      expect(mockIngest).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("publishes to Tinybird via zod-bird when TINYBIRD_TOKEN is set", async () => {
      process.env.TINYBIRD_TOKEN = "test-token-123";

      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await publishServerEvent("funnel_org_created", { orgId: "org-1" });

      expect(mockIngest).toHaveBeenCalledTimes(1);
      expect(mockIngest).toHaveBeenCalledWith(
        expect.objectContaining({
          event_name: "funnel_org_created",
          orgId: "org-1",
          timestamp: expect.any(String),
        }),
      );
    });

    it("creates Tinybird client with correct config", async () => {
      process.env.TINYBIRD_TOKEN = "test-token";
      process.env.TINYBIRD_HOST = "https://custom.tinybird.co";

      const { Tinybird } = await import("@chronark/zod-bird");
      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await publishServerEvent("test_event");

      expect(Tinybird).toHaveBeenCalledWith({
        token: "test-token",
        baseUrl: "https://custom.tinybird.co",
      });
    });

    it("uses default US West 2 host when TINYBIRD_HOST is not set", async () => {
      process.env.TINYBIRD_TOKEN = "test-token";

      const { Tinybird } = await import("@chronark/zod-bird");
      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await publishServerEvent("test_event");

      expect(Tinybird).toHaveBeenCalledWith({
        token: "test-token",
        baseUrl: "https://api.us-west-2.aws.tinybird.co",
      });
    });

    it("logs warning when zod-bird ingest throws", async () => {
      process.env.TINYBIRD_TOKEN = "test-token";
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      mockIngest.mockRejectedValueOnce(new Error("Network error"));

      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await publishServerEvent("test_event");

      expect(warnSpy).toHaveBeenCalledWith(
        "[SERVER_EVENTS] Tinybird publish error:",
        expect.any(Error),
      );

      warnSpy.mockRestore();
    });

    it("never throws even on ingest error", async () => {
      process.env.TINYBIRD_TOKEN = "test-token";
      jest.spyOn(console, "warn").mockImplementation();
      mockIngest.mockRejectedValueOnce(new Error("Connection refused"));

      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await expect(
        publishServerEvent("test_event"),
      ).resolves.toBeUndefined();

      jest.restoreAllMocks();
    });

    it("sends only event_name and timestamp when no properties provided", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await publishServerEvent("minimal_event");

      expect(consoleSpy).toHaveBeenCalledWith(
        "[FUNNEL] minimal_event",
        {
          event_name: "minimal_event",
          timestamp: expect.any(String),
        },
      );

      consoleSpy.mockRestore();
    });

    it("builds ingest endpoint with server_events__v1 datasource", async () => {
      process.env.TINYBIRD_TOKEN = "test-token";

      const { publishServerEvent } = await import("@/lib/tracking/server-events");
      await publishServerEvent("test_event");

      expect(mockBuildIngestEndpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          datasource: "server_events__v1",
        }),
      );
    });
  });
});
