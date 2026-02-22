/**
 * Tests for POST /api/lp/register
 *
 * LP registration endpoint: creates user + investor profile + optional fund association.
 * Rate-limited, bot-protected, with validation and welcome email.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
  requireFundroomActiveByFund: jest.fn().mockResolvedValue(true),
  PAYWALL_ERROR: { error: "This feature requires a FundRoom subscription." },
}));

jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));

jest.mock("@/lib/emails/send-investor-welcome", () => ({
  sendInvestorWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendInvestorWelcomeEmailWithFund: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-accreditation-confirmed", () => ({
  sendAccreditationConfirmedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/crm/contact-upsert-job", () => ({
  captureFromLPRegistration: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

// @/lib/redis is globally mocked in jest.setup.ts with a shared __mockRateLimitFn.
// The App Router register route uses ratelimit() from @/lib/redis directly,
// so rate limiting behavior is still controlled via mockRateLimitFn.

import { POST } from "@/app/api/lp/register/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";

const handler = wrapAppRouteHandler({ POST });

// Get references to mocked functions for per-test control
const verifyNotBot = jest.requireMock("@/lib/security/bot-protection").verifyNotBot;
const mockSendWelcome = jest.requireMock("@/lib/emails/send-investor-welcome").sendInvestorWelcomeEmail;
const mockSendWelcomeWithFund = jest.requireMock("@/lib/emails/send-investor-welcome").sendInvestorWelcomeEmailWithFund;
const mockRateLimitFn = jest.requireMock("@/lib/redis").__mockRateLimitFn;

const mockNewUser = {
  id: "user-new",
  email: "lp@example.com",
  name: "New LP",
  role: "LP",
  investorProfile: {
    id: "inv-new",
    userId: "user-new",
    entityName: null,
    entityType: "INDIVIDUAL",
    fundData: null,
    ndaSigned: false,
  },
};

function createReq(body: Record<string, unknown> = {}) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body: {
      name: "New LP",
      email: "lp@example.com",
      ...body,
    },
    headers: {
      "x-forwarded-for": "1.2.3.4",
    },
  });
}

describe("POST /api/lp/register", () => {
  beforeEach(() => {
    // Reset call counts but preserve implementations from jest.mock factories
    jest.clearAllMocks();

    // Re-set implementations that clearAllMocks may have cleared
    mockRateLimitFn.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
    });
    verifyNotBot.mockResolvedValue({ blocked: false });
    mockSendWelcome.mockResolvedValue(undefined);
    mockSendWelcomeWithFund.mockResolvedValue(undefined);

    // Reset Prisma mocks and set up default new-user path
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.create as jest.Mock).mockReset();
    (prisma.user.update as jest.Mock).mockReset();
    (prisma.investor.create as jest.Mock).mockReset();
    (prisma.investor.update as jest.Mock).mockReset();
    (prisma.fund.findUnique as jest.Mock).mockReset();
    (prisma.investment.findFirst as jest.Mock).mockReset();
    (prisma.investment.create as jest.Mock).mockReset();

    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // First call: user not found
      .mockResolvedValueOnce(mockNewUser); // Re-fetch after creation (if needed)
    (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
  });

  // --- Method enforcement ---
  it("rejects non-POST methods with 405", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: method as any,
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(405);
    }
  });

  // --- Bot protection ---
  it("rejects requests that fail bot verification", async () => {
    verifyNotBot.mockResolvedValue({
      blocked: true,
      response: new (require("next/server").NextResponse)(
        JSON.stringify({ error: "Bot detected" }),
        { status: 403 },
      ),
    });
    const { req, res } = createReq();
    await handler(req, res);
    // verifyNotBot returns a response when blocked, so handler returns early
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  // --- Rate limiting ---
  it("returns 429 when rate limited", async () => {
    mockRateLimitFn.mockResolvedValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(429);
    expect(JSON.parse(res._getData()).error).toContain("Too many requests");
  });

  it("returns 503 when rate limiter (Redis) is down — fail closed", async () => {
    mockRateLimitFn.mockRejectedValue(new Error("Redis connection refused"));
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(503);
    expect(reportError).toHaveBeenCalled();
  });

  // --- Input validation ---
  it("returns 400 when name is missing", async () => {
    const { req, res } = createReq({ name: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("Name and email");
  });

  it("returns 400 when email is missing", async () => {
    const { req, res } = createReq({ email: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const { req, res } = createReq({ email: "not-an-email" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("Invalid email");
  });

  it("returns 400 for email without domain", async () => {
    const { req, res } = createReq({ email: "test@" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  // --- Email normalization ---
  it("normalizes email to lowercase", async () => {
    const { req, res } = createReq({ email: "LP@Example.COM" });
    await handler(req, res);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "lp@example.com" },
      }),
    );
  });

  // --- New user creation ---
  it("creates new user with LP role and investor profile", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).success).toBe(true);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "New LP",
          email: "lp@example.com",
          role: "LP",
          investorProfile: expect.objectContaining({
            create: expect.objectContaining({
              entityType: "INDIVIDUAL",
            }),
          }),
        }),
        include: { investorProfile: true },
      }),
    );
  });

  it("sends welcome email after successful registration", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockSendWelcome).toHaveBeenCalledWith("user-new");
    expect(mockSendWelcomeWithFund).not.toHaveBeenCalled();
  });

  it("sends fund-aware welcome email when fundId is provided", async () => {
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue({
      id: "fund-1",
      teamId: "team-1",
    });
    (prisma.investment.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.investment.create as jest.Mock).mockResolvedValue({ id: "inv-1" });

    const { req, res } = createReq({ fundId: "fund-1" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockSendWelcomeWithFund).toHaveBeenCalledWith("user-new", "fund-1");
    expect(mockSendWelcome).not.toHaveBeenCalled();
  });

  // --- Entity type inference ---
  it("uses explicit entityType when provided", async () => {
    const { req, res } = createReq({
      entityType: "LLC",
      entityName: "Test LLC",
    });
    await handler(req, res);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          investorProfile: expect.objectContaining({
            create: expect.objectContaining({
              entityType: "LLC",
              entityName: "Test LLC",
            }),
          }),
        }),
      }),
    );
  });

  it("infers ENTITY type when entityName is provided without entityType", async () => {
    const { req, res } = createReq({ entityName: "Acme Corp" });
    await handler(req, res);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          investorProfile: expect.objectContaining({
            create: expect.objectContaining({
              entityType: "ENTITY",
              entityName: "Acme Corp",
            }),
          }),
        }),
      }),
    );
  });

  it("defaults to INDIVIDUAL when no entityName or entityType", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          investorProfile: expect.objectContaining({
            create: expect.objectContaining({
              entityType: "INDIVIDUAL",
            }),
          }),
        }),
      }),
    );
  });

  // --- NDA and accreditation ---
  it("sets ndaSigned and accreditation when provided", async () => {
    const { req, res } = createReq({
      ndaAccepted: true,
      accreditationType: "INCOME",
    });
    await handler(req, res);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          investorProfile: expect.objectContaining({
            create: expect.objectContaining({
              ndaSigned: true,
              accreditationStatus: "SELF_CERTIFIED",
              accreditationType: "INCOME",
              onboardingStep: 5,
            }),
          }),
        }),
      }),
    );
  });

  it("sets onboardingStep to 1 when NDA not accepted", async () => {
    const { req, res } = createReq({ ndaAccepted: false });
    await handler(req, res);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          investorProfile: expect.objectContaining({
            create: expect.objectContaining({
              onboardingStep: 1,
            }),
          }),
        }),
      }),
    );
  });

  // --- Existing user without investor profile ---
  it("creates investor profile for existing user without one", async () => {
    const existingUser = {
      id: "user-existing",
      email: "lp@example.com",
      name: "Existing User",
      role: "LP",
      investorProfile: null,
    };
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(existingUser) // First: user found without profile
      .mockResolvedValueOnce({
        ...existingUser,
        investorProfile: { id: "inv-new" },
      }); // Re-fetch
    (prisma.investor.create as jest.Mock).mockResolvedValue({
      id: "inv-new",
    });

    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-existing",
        }),
      }),
    );
  });

  // --- Existing user with investor profile: upgrade NDA/accreditation ---
  it("upgrades NDA and accreditation on existing profile when flags are false", async () => {
    const existingUser = {
      id: "user-existing",
      email: "lp@example.com",
      name: "Existing User",
      role: "LP",
      investorProfile: {
        id: "inv-existing",
        entityName: "Existing Corp",
        ndaSigned: false,
        accreditationStatus: "PENDING",
        onboardingStep: 1,
      },
    };
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(existingUser)
      .mockResolvedValueOnce(existingUser);

    const { req, res } = createReq({
      ndaAccepted: true,
      accreditationType: "INCOME",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // Should upgrade NDA, accreditation, and onboardingStep on existing profile
    expect(prisma.investor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-existing" },
        data: expect.objectContaining({
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          accreditationType: "INCOME",
          onboardingStep: 5,
        }),
      }),
    );
  });

  it("does not downgrade accreditation on existing profile", async () => {
    const existingUser = {
      id: "user-existing",
      email: "lp@example.com",
      name: "Existing User",
      role: "LP",
      investorProfile: {
        id: "inv-existing",
        entityName: "Existing Corp",
        ndaSigned: true,
        accreditationStatus: "KYC_VERIFIED",
        onboardingStep: 7,
      },
    };
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(existingUser)
      .mockResolvedValueOnce(existingUser);

    const { req, res } = createReq({
      ndaAccepted: true,
      accreditationType: "INCOME",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // Should NOT update investor since NDA is already true and accreditation is KYC_VERIFIED
    expect(prisma.investor.update).not.toHaveBeenCalled();
  });

  // --- Existing user with investor profile ---
  it("does not overwrite existing investor profile", async () => {
    const existingUser = {
      id: "user-existing",
      email: "lp@example.com",
      name: "Existing User",
      role: "LP",
      investorProfile: {
        id: "inv-existing",
        entityName: "Existing Corp",
      },
    };
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(existingUser)
      .mockResolvedValueOnce(existingUser);

    const { req, res } = createReq({ entityName: "Override Attempt" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.create).not.toHaveBeenCalled();
  });

  // --- Role protection ---
  it("does not downgrade existing user role", async () => {
    const existingUser = {
      id: "user-gp",
      email: "lp@example.com",
      name: "GP User",
      role: "ADMIN", // Has admin role
      investorProfile: null,
    };
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(existingUser)
      .mockResolvedValueOnce({
        ...existingUser,
        investorProfile: { id: "inv-new" },
      });
    (prisma.investor.create as jest.Mock).mockResolvedValue({ id: "inv-new" });

    const { req, res } = createReq();
    await handler(req, res);
    // Should NOT update role since user already has one
    expect(prisma.user.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: "LP" },
      }),
    );
  });

  // --- Fund association ---
  it("associates investor with fund when fundId is valid", async () => {
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue({
      id: "fund-1",
      teamId: "team-1",
    });
    (prisma.investment.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.investment.create as jest.Mock).mockResolvedValue({ id: "inv-1" });

    const { req, res } = createReq({ fundId: "fund-1" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-new" },
        data: expect.objectContaining({
          fundId: "fund-1",
        }),
      }),
    );
  });

  it("creates initial investment record when associating with fund", async () => {
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue({
      id: "fund-1",
      teamId: "team-1",
    });
    (prisma.investment.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.investment.create as jest.Mock).mockResolvedValue({
      id: "invest-1",
    });

    const { req, res } = createReq({ fundId: "fund-1" });
    await handler(req, res);
    expect(prisma.investment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fundId: "fund-1",
          investorId: "inv-new",
          commitmentAmount: 0,
          fundedAmount: 0,
          status: "APPLIED",
        }),
      }),
    );
  });

  it("skips fund association when fund not found", async () => {
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(null);

    const { req, res } = createReq({ fundId: "invalid-fund" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // Should not update investor or create investment
    expect(prisma.investor.update).not.toHaveBeenCalled();
  });

  it("skips fund association when teamId mismatches", async () => {
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue({
      id: "fund-1",
      teamId: "team-1",
    });

    const { req, res } = createReq({
      fundId: "fund-1",
      teamId: "wrong-team",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.update).not.toHaveBeenCalled();
  });

  it("does not fail registration when fund association errors", async () => {
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockNewUser);
    (prisma.fund.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );

    const { req, res } = createReq({ fundId: "fund-1" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(reportError).toHaveBeenCalled();
  });

  // --- Error handling ---
  it("returns 500 on unexpected errors", async () => {
    (prisma.user.findUnique as jest.Mock).mockReset();
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB crash"),
    );
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });
});
