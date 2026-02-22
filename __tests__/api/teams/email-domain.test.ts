// @ts-nocheck
/**
 * Tests for app/api/teams/[teamId]/email-domain/route.ts (GET, POST, PATCH, DELETE)
 * and app/api/teams/[teamId]/email-domain/verify/route.ts (POST)
 */

const mockAuthenticateGP = jest.fn();

jest.mock("@/lib/marketplace/auth", () => ({
  authenticateGP: (...args: any[]) => mockAuthenticateGP(...args),
}));

const mockCreateEmailDomain = jest.fn();
const mockGetEmailDomainStatus = jest.fn();
const mockRemoveEmailDomain = jest.fn();
const mockUpdateEmailFromSettings = jest.fn();
const mockVerifyEmailDomain = jest.fn();

jest.mock("@/lib/email/domain-service", () => ({
  createEmailDomain: (...args: any[]) => mockCreateEmailDomain(...args),
  getEmailDomainStatus: (...args: any[]) => mockGetEmailDomainStatus(...args),
  removeEmailDomain: (...args: any[]) => mockRemoveEmailDomain(...args),
  updateEmailFromSettings: (...args: any[]) => mockUpdateEmailFromSettings(...args),
  verifyEmailDomain: (...args: any[]) => mockVerifyEmailDomain(...args),
}));

const mockTeamFindUnique = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    team: {
      findUnique: (...args: any[]) => mockTeamFindUnique(...args),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock("@/pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

import { NextResponse } from "next/server";

// Helpers
function makeParams(teamId: string) {
  return { params: Promise.resolve({ teamId }) };
}

function makeRequest(url: string, options?: RequestInit) {
  return new Request(url, options) as any;
}

describe("Email Domain API — /api/teams/[teamId]/email-domain", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Successful auth helper
  function authSuccess() {
    mockAuthenticateGP.mockResolvedValue({
      userId: "user-1",
      teamId: "team-1",
      role: "ADMIN",
    });
  }

  function authFail() {
    mockAuthenticateGP.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
  }

  // ---------------------------------------------------------------------------
  // GET /api/teams/[teamId]/email-domain
  // ---------------------------------------------------------------------------

  describe("GET", () => {
    it("returns configured:false when no domain set up", async () => {
      authSuccess();
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
        emailDomain: null,
        emailDomainStatus: null,
      });

      const { GET } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await GET(
        makeRequest("http://localhost/api/teams/team-1/email-domain"),
        makeParams("team-1"),
      );

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.configured).toBe(false);
    });

    it("returns live status from Resend when domain configured", async () => {
      authSuccess();
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: "dom_abc",
        emailDomain: "mail.example.com",
        emailDomainStatus: "pending",
        emailDomainRegion: "us-east-1",
        emailFromName: "Test Fund",
        emailFromAddress: "notify",
        emailReplyTo: "support@test.com",
        emailDomainVerifiedAt: null,
        emailDomainDnsRecords: [],
      });

      mockGetEmailDomainStatus.mockResolvedValue({
        id: "dom_abc",
        name: "mail.example.com",
        status: "verified",
        region: "us-east-1",
        dnsRecords: [{ type: "MX", name: "mail.example.com", value: "smtp.resend.com" }],
      });

      const { GET } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await GET(
        makeRequest("http://localhost/api/teams/team-1/email-domain"),
        makeParams("team-1"),
      );

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.configured).toBe(true);
      expect(data.status).toBe("verified");
      expect(data.fromName).toBe("Test Fund");
    });

    it("returns cached data when Resend API fails", async () => {
      authSuccess();
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: "dom_abc",
        emailDomain: "mail.example.com",
        emailDomainStatus: "pending",
        emailDomainRegion: "us-east-1",
        emailFromName: null,
        emailFromAddress: null,
        emailReplyTo: null,
        emailDomainVerifiedAt: null,
        emailDomainDnsRecords: [{ type: "TXT", name: "test", value: "v=spf1" }],
      });

      mockGetEmailDomainStatus.mockRejectedValue(new Error("Resend timeout"));

      const { GET } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await GET(
        makeRequest("http://localhost/api/teams/team-1/email-domain"),
        makeParams("team-1"),
      );

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.configured).toBe(true);
      expect(data.cached).toBe(true);
      expect(data.status).toBe("pending");
    });

    it("returns 401 when not authenticated", async () => {
      authFail();

      const { GET } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await GET(
        makeRequest("http://localhost/api/teams/team-1/email-domain"),
        makeParams("team-1"),
      );

      expect(res.status).toBe(401);
    });

    it("returns 404 when team not found", async () => {
      authSuccess();
      mockTeamFindUnique.mockResolvedValue(null);

      const { GET } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await GET(
        makeRequest("http://localhost/api/teams/team-1/email-domain"),
        makeParams("team-1"),
      );

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/teams/[teamId]/email-domain
  // ---------------------------------------------------------------------------

  describe("POST", () => {
    it("creates a new email domain", async () => {
      authSuccess();
      mockCreateEmailDomain.mockResolvedValue({
        domainId: "dom_new",
        domain: "mail.fund.com",
        status: "pending",
        region: "us-east-1",
        dnsRecords: [
          { type: "MX", name: "mail.fund.com", value: "smtp.resend.com", priority: 10 },
        ],
      });

      const { POST } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await POST(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: "mail.fund.com" }),
        }),
        makeParams("team-1"),
      );

      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.domainId).toBe("dom_new");
      expect(data.dnsRecords).toHaveLength(1);
      expect(mockCreateEmailDomain).toHaveBeenCalledWith("team-1", "mail.fund.com", undefined);
    });

    it("lowercases the domain", async () => {
      authSuccess();
      mockCreateEmailDomain.mockResolvedValue({
        domainId: "dom_new",
        domain: "mail.fund.com",
        status: "pending",
        region: "us-east-1",
        dnsRecords: [],
      });

      const { POST } = await import("@/app/api/teams/[teamId]/email-domain/route");

      await POST(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: "Mail.FUND.com" }),
        }),
        makeParams("team-1"),
      );

      expect(mockCreateEmailDomain).toHaveBeenCalledWith("team-1", "mail.fund.com", undefined);
    });

    it("returns 400 for missing domain", async () => {
      authSuccess();

      const { POST } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await POST(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
        makeParams("team-1"),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid domain format", async () => {
      authSuccess();

      const { POST } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await POST(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: "not a domain!" }),
        }),
        makeParams("team-1"),
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid domain format");
    });

    it("returns 401 when not authenticated", async () => {
      authFail();

      const { POST } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await POST(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: "mail.fund.com" }),
        }),
        makeParams("team-1"),
      );

      expect(res.status).toBe(401);
    });

    it("returns 409 when createEmailDomain throws duplicate domain error", async () => {
      authSuccess();
      mockCreateEmailDomain.mockRejectedValue(new Error("Team already has a domain"));

      const { POST } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await POST(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: "mail.fund.com" }),
        }),
        makeParams("team-1"),
      );

      expect(res.status).toBe(409);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/teams/[teamId]/email-domain
  // ---------------------------------------------------------------------------

  describe("PATCH", () => {
    it("updates from settings", async () => {
      authSuccess();
      mockUpdateEmailFromSettings.mockResolvedValue(undefined);

      const { PATCH } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await PATCH(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromName: "Bermuda Club",
            fromAddress: "investors",
            replyTo: "support@bermudaclub.com",
          }),
        }),
        makeParams("team-1"),
      );

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockUpdateEmailFromSettings).toHaveBeenCalledWith("team-1", {
        fromName: "Bermuda Club",
        fromAddress: "investors",
        replyTo: "support@bermudaclub.com",
      });
    });

    it("returns 401 when not authenticated", async () => {
      authFail();

      const { PATCH } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await PATCH(
        makeRequest("http://localhost/api/teams/team-1/email-domain", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromName: "Test" }),
        }),
        makeParams("team-1"),
      );

      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/teams/[teamId]/email-domain
  // ---------------------------------------------------------------------------

  describe("DELETE", () => {
    it("removes the email domain", async () => {
      authSuccess();
      mockRemoveEmailDomain.mockResolvedValue(undefined);

      const { DELETE } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await DELETE(
        makeRequest("http://localhost/api/teams/team-1/email-domain", { method: "DELETE" }),
        makeParams("team-1"),
      );

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockRemoveEmailDomain).toHaveBeenCalledWith("team-1");
    });

    it("returns 401 when not authenticated", async () => {
      authFail();

      const { DELETE } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await DELETE(
        makeRequest("http://localhost/api/teams/team-1/email-domain", { method: "DELETE" }),
        makeParams("team-1"),
      );

      expect(res.status).toBe(401);
    });

    it("returns 500 when removeEmailDomain throws", async () => {
      authSuccess();
      mockRemoveEmailDomain.mockRejectedValue(new Error("No domain configured"));

      const { DELETE } = await import("@/app/api/teams/[teamId]/email-domain/route");

      const res = await DELETE(
        makeRequest("http://localhost/api/teams/team-1/email-domain", { method: "DELETE" }),
        makeParams("team-1"),
      );

      expect(res.status).toBe(500);
    });
  });
});

// ---------------------------------------------------------------------------
// Verify endpoint: /api/teams/[teamId]/email-domain/verify
// ---------------------------------------------------------------------------

describe("Email Domain Verify API — /api/teams/[teamId]/email-domain/verify", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function authSuccess() {
    mockAuthenticateGP.mockResolvedValue({
      userId: "user-1",
      teamId: "team-1",
      role: "ADMIN",
    });
  }

  function authFail() {
    mockAuthenticateGP.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
  }

  it("triggers verification and returns status", async () => {
    authSuccess();
    mockVerifyEmailDomain.mockResolvedValue({
      name: "mail.example.com",
      status: "verified",
      dnsRecords: [{ type: "MX", name: "mail.example.com", value: "smtp.resend.com" }],
    });

    const { POST } = await import("@/app/api/teams/[teamId]/email-domain/verify/route");

    const res = await POST(
      makeRequest("http://localhost/api/teams/team-1/email-domain/verify", { method: "POST" }),
      { params: Promise.resolve({ teamId: "team-1" }) },
    );

    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.domain).toBe("mail.example.com");
    expect(data.status).toBe("verified");
    expect(data.dnsRecords).toHaveLength(1);
  });

  it("returns 401 when not authenticated", async () => {
    authFail();

    const { POST } = await import("@/app/api/teams/[teamId]/email-domain/verify/route");

    const res = await POST(
      makeRequest("http://localhost/api/teams/team-1/email-domain/verify", { method: "POST" }),
      { params: Promise.resolve({ teamId: "team-1" }) },
    );

    expect(res.status).toBe(401);
  });

  it("returns 500 when verification fails", async () => {
    authSuccess();
    mockVerifyEmailDomain.mockRejectedValue(new Error("No domain configured"));

    const { POST } = await import("@/app/api/teams/[teamId]/email-domain/verify/route");

    const res = await POST(
      makeRequest("http://localhost/api/teams/team-1/email-domain/verify", { method: "POST" }),
      { params: Promise.resolve({ teamId: "team-1" }) },
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Internal server error");
  });
});
