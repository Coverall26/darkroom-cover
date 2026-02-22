/**
 * Tests for record-link-view module.
 */

// Mock all external dependencies BEFORE imports
jest.mock("@vercel/functions", () => ({
  geolocation: jest.fn(),
  ipAddress: jest.fn(),
}));

jest.mock("@/lib/tinybird", () => ({
  recordLinkViewTB: jest.fn(),
}));

jest.mock("@/lib/utils/user-agent", () => ({
  isBot: jest.fn(),
}));

jest.mock("@/lib/utils/geo", () => ({
  LOCALHOST_GEO_DATA: {
    city: "localhost",
    country: "US",
    countryRegion: "CA",
    latitude: "0",
    longitude: "0",
    region: "local",
    continent: "NA",
  },
  LOCALHOST_IP: "127.0.0.1",
}));

// Mock lib/utils (has nanoid ESM dependency)
jest.mock("@/lib/utils", () => ({
  capitalize: jest.fn((s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s),
  getDomainWithoutWWW: jest.fn((url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }),
}));

jest.mock("@/lib/constants", () => ({
  EU_COUNTRY_CODES: ["DE", "FR", "IT", "ES", "NL", "BE", "AT", "IE", "PT", "FI", "SE", "DK", "PL", "CZ", "RO", "HU", "SK", "HR", "SI", "LT", "LV", "EE", "BG", "CY", "LU", "MT", "GR"],
}));

// Mock notification and webhook helpers (relative imports from lib/tracking/ -> lib/api/)
jest.mock("@/lib/api/notification-helper", () => jest.fn().mockResolvedValue(undefined));
jest.mock("@/lib/api/views/send-webhook-event", () => ({
  sendLinkViewWebhook: jest.fn().mockResolvedValue(undefined),
}));

// next/server userAgent function
jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    userAgent: jest.fn(() => ({
      ua: "Mozilla/5.0 Chrome/120",
      browser: { name: "Chrome", version: "120" },
      engine: { name: "Blink", version: "120" },
      os: { name: "macOS", version: "14" },
      device: { type: undefined, vendor: undefined, model: undefined },
      cpu: { architecture: "amd64" },
      isBot: false,
    })),
  };
});

import { geolocation, ipAddress } from "@vercel/functions";
import { recordLinkViewTB } from "@/lib/tinybird";
import { isBot } from "@/lib/utils/user-agent";
import { NextRequest } from "next/server";

const mockGeolocation = geolocation as jest.MockedFunction<typeof geolocation>;
const mockIpAddress = ipAddress as jest.MockedFunction<typeof ipAddress>;
const mockRecordLinkViewTB = recordLinkViewTB as jest.MockedFunction<typeof recordLinkViewTB>;
const mockIsBot = isBot as jest.MockedFunction<typeof isBot>;

// Must import after mocks
import { recordLinkView } from "@/lib/tracking/record-link-view";

function createMockRequest(options: {
  userAgent?: string;
  referer?: string;
} = {}): NextRequest {
  const headers = new Headers({
    "user-agent": options.userAgent ?? "Mozilla/5.0 Chrome/120",
    ...(options.referer ? { referer: options.referer } : {}),
  });

  return {
    headers,
    nextUrl: new URL("https://app.fundroom.ai/view/doc-1"),
  } as unknown as NextRequest;
}

describe("recordLinkView", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.VERCEL;
    delete process.env.TINYBIRD_TOKEN;
    mockIsBot.mockReturnValue(false);
    mockGeolocation.mockReturnValue({
      city: "San Francisco",
      country: "US",
      countryRegion: "CA",
      latitude: "37.7749",
      longitude: "-122.4194",
      region: "sfo1",
    } as any);
    mockIpAddress.mockReturnValue("127.0.0.1");
    mockRecordLinkViewTB.mockResolvedValue(undefined as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns null when request is from a bot", async () => {
    mockIsBot.mockReturnValue(true);

    const result = await recordLinkView({
      req: createMockRequest({ userAgent: "Googlebot/2.1" }),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(result).toBeNull();
    expect(mockRecordLinkViewTB).not.toHaveBeenCalled();
  });

  it("returns click data for valid non-bot request", async () => {
    const result = await recordLinkView({
      req: createMockRequest(),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(result).toBeDefined();
    expect(result!.click_id).toBe("click-1");
    expect(result!.view_id).toBe("view-1");
    expect(result!.link_id).toBe("link-1");
    expect(result!.timestamp).toBeDefined();
  });

  it("uses localhost defaults when not on Vercel", async () => {
    const result = await recordLinkView({
      req: createMockRequest(),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(result).toBeDefined();
    expect(result!.device).toBe("Desktop");
  });

  it("sets document_id and dataroom_id when provided", async () => {
    const result = await recordLinkView({
      req: createMockRequest(),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      documentId: "doc-42",
      dataroomId: "dr-7",
      enableNotification: false,
    });

    expect(result!.document_id).toBe("doc-42");
    expect(result!.dataroom_id).toBe("dr-7");
  });

  it("sets null for optional IDs when not provided", async () => {
    const result = await recordLinkView({
      req: createMockRequest(),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(result!.document_id).toBeNull();
    expect(result!.dataroom_id).toBeNull();
  });

  it("extracts referer URL", async () => {
    const result = await recordLinkView({
      req: createMockRequest({ referer: "https://www.google.com/search?q=test" }),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(result!.referer_url).toBe("https://www.google.com/search?q=test");
  });

  it("uses (direct) when no referer", async () => {
    const result = await recordLinkView({
      req: createMockRequest(),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(result!.referer_url).toBe("(direct)");
  });

  it("skips Tinybird recording when TINYBIRD_TOKEN is not set", async () => {
    await recordLinkView({
      req: createMockRequest(),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(mockRecordLinkViewTB).not.toHaveBeenCalled();
  });

  it("records to Tinybird when TINYBIRD_TOKEN is set", async () => {
    process.env.TINYBIRD_TOKEN = "tb-token";

    await recordLinkView({
      req: createMockRequest(),
      clickId: "click-1",
      viewId: "view-1",
      linkId: "link-1",
      teamId: "team-1",
      enableNotification: false,
    });

    expect(mockRecordLinkViewTB).toHaveBeenCalledWith(
      expect.objectContaining({
        click_id: "click-1",
        link_id: "link-1",
      }),
    );
  });
});
