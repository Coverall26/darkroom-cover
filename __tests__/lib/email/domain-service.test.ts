// @ts-nocheck
/**
 * Tests for lib/email/domain-service.ts
 * Covers: createEmailDomain, verifyEmailDomain, getEmailDomainStatus,
 *         removeEmailDomain, updateEmailFromSettings, getTeamFromAddress
 */

const mockDomainsCreate = jest.fn();
const mockDomainsVerify = jest.fn();
const mockDomainsGet = jest.fn();
const mockDomainsRemove = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    domains: {
      create: (...args: any[]) => mockDomainsCreate(...args),
      verify: (...args: any[]) => mockDomainsVerify(...args),
      get: (...args: any[]) => mockDomainsGet(...args),
      remove: (...args: any[]) => mockDomainsRemove(...args),
    },
  })),
}));

const mockTeamFindUnique = jest.fn();
const mockTeamUpdate = jest.fn();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    team: {
      findUnique: (...args: any[]) => mockTeamFindUnique(...args),
      update: (...args: any[]) => mockTeamUpdate(...args),
    },
  },
}));

import {
  createEmailDomain,
  verifyEmailDomain,
  getEmailDomainStatus,
  removeEmailDomain,
  updateEmailFromSettings,
  getTeamFromAddress,
} from "@/lib/email/domain-service";

describe("Email Domain Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = "test-resend-key";
  });

  // ---------------------------------------------------------------------------
  // createEmailDomain
  // ---------------------------------------------------------------------------

  describe("createEmailDomain", () => {
    it("creates a domain in Resend and saves to database", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
        emailDomain: null,
      });

      mockDomainsCreate.mockResolvedValue({
        data: {
          id: "dom_abc123",
          status: "pending",
          records: [
            { type: "MX", name: "mail.example.com", value: "feedback-smtp.us-east-1.amazonses.com", priority: 10 },
            { type: "TXT", name: "mail.example.com", value: "v=spf1 include:amazonses.com ~all" },
          ],
        },
        error: null,
      });

      mockTeamUpdate.mockResolvedValue({});

      const result = await createEmailDomain("team-1", "mail.example.com");

      expect(result.domainId).toBe("dom_abc123");
      expect(result.domain).toBe("mail.example.com");
      expect(result.status).toBe("pending");
      expect(result.dnsRecords).toHaveLength(2);
      expect(result.dnsRecords[0].type).toBe("MX");

      expect(mockDomainsCreate).toHaveBeenCalledWith({
        name: "mail.example.com",
        region: "us-east-1",
      });

      expect(mockTeamUpdate).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: expect.objectContaining({
          emailDomainId: "dom_abc123",
          emailDomain: "mail.example.com",
          emailDomainStatus: "pending",
        }),
      });
    });

    it("throws if team already has a domain configured", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: "dom_existing",
        emailDomain: "existing.com",
      });

      await expect(
        createEmailDomain("team-1", "new.example.com"),
      ).rejects.toThrow("Team already has a domain configured: existing.com");
    });

    it("throws if Resend returns an error", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
        emailDomain: null,
      });

      mockDomainsCreate.mockResolvedValue({
        data: null,
        error: { message: "Domain already exists" },
      });

      await expect(
        createEmailDomain("team-1", "taken.com"),
      ).rejects.toThrow("Failed to create domain: Domain already exists");
    });

    it("throws if Resend returns no data", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
        emailDomain: null,
      });

      mockDomainsCreate.mockResolvedValue({ data: null, error: null });

      await expect(
        createEmailDomain("team-1", "example.com"),
      ).rejects.toThrow("Resend returned no data when creating domain");
    });

    it("accepts a custom region", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
        emailDomain: null,
      });

      mockDomainsCreate.mockResolvedValue({
        data: { id: "dom_eu", status: "pending", records: [] },
        error: null,
      });

      mockTeamUpdate.mockResolvedValue({});

      const result = await createEmailDomain("team-1", "mail.eu-org.com", "eu-west-1");

      expect(mockDomainsCreate).toHaveBeenCalledWith({
        name: "mail.eu-org.com",
        region: "eu-west-1",
      });
      expect(result.region).toBe("eu-west-1");
    });

    it("normalizes DNS records with alternate field names", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
        emailDomain: null,
      });

      mockDomainsCreate.mockResolvedValue({
        data: {
          id: "dom_norm",
          status: "pending",
          records: [
            { record_type: "CNAME", host: "_dkim.example.com", data: "dkim.resend.dev", ttl: "Auto" },
          ],
        },
        error: null,
      });

      mockTeamUpdate.mockResolvedValue({});

      const result = await createEmailDomain("team-1", "example.com");

      expect(result.dnsRecords[0]).toEqual({
        type: "CNAME",
        name: "_dkim.example.com",
        value: "dkim.resend.dev",
        priority: undefined,
        ttl: "Auto",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // verifyEmailDomain
  // ---------------------------------------------------------------------------

  describe("verifyEmailDomain", () => {
    it("triggers verification and returns updated status", async () => {
      mockTeamFindUnique
        .mockResolvedValueOnce({
          emailDomainId: "dom_abc",
          emailDomain: "mail.example.com",
        })
        // Called by getEmailDomainStatus internally
        .mockResolvedValueOnce({
          emailDomainId: "dom_abc",
          emailDomain: "mail.example.com",
          emailDomainStatus: "pending",
          emailDomainDnsRecords: [],
        });

      mockDomainsVerify.mockResolvedValue({ data: { status: "verified" }, error: null });
      mockDomainsGet.mockResolvedValue({
        data: { status: "verified", records: [] },
        error: null,
      });
      mockTeamUpdate.mockResolvedValue({});

      const result = await verifyEmailDomain("team-1");

      expect(mockDomainsVerify).toHaveBeenCalledWith("dom_abc");
      expect(result.status).toBe("verified");
    });

    it("throws if no domain configured", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
        emailDomain: null,
      });

      await expect(verifyEmailDomain("team-1")).rejects.toThrow(
        "No email domain configured for this team",
      );
    });

    it("throws if Resend returns an error on verify", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: "dom_abc",
        emailDomain: "mail.example.com",
      });

      mockDomainsVerify.mockResolvedValue({
        data: null,
        error: { message: "DNS records not found" },
      });

      await expect(verifyEmailDomain("team-1")).rejects.toThrow(
        "Failed to verify domain: DNS records not found",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getEmailDomainStatus
  // ---------------------------------------------------------------------------

  describe("getEmailDomainStatus", () => {
    it("fetches status from Resend and syncs to DB", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: "dom_abc",
        emailDomain: "mail.example.com",
        emailDomainStatus: "pending",
        emailDomainDnsRecords: [],
      });

      mockDomainsGet.mockResolvedValue({
        data: {
          status: "verified",
          records: [
            { type: "MX", name: "mail.example.com", value: "smtp.resend.com", priority: 10 },
          ],
        },
        error: null,
      });

      mockTeamUpdate.mockResolvedValue({});

      const result = await getEmailDomainStatus("team-1");

      expect(result.id).toBe("dom_abc");
      expect(result.name).toBe("mail.example.com");
      expect(result.status).toBe("verified");
      expect(result.dnsRecords).toHaveLength(1);

      // Should set verifiedAt since it changed from pending to verified
      expect(mockTeamUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailDomainStatus: "verified",
            emailDomainVerifiedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("does not set verifiedAt if already verified", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: "dom_abc",
        emailDomain: "mail.example.com",
        emailDomainStatus: "verified",
        emailDomainDnsRecords: [],
      });

      mockDomainsGet.mockResolvedValue({
        data: { status: "verified", records: [] },
        error: null,
      });

      mockTeamUpdate.mockResolvedValue({});

      await getEmailDomainStatus("team-1");

      const updateCall = mockTeamUpdate.mock.calls[0][0];
      expect(updateCall.data.emailDomainVerifiedAt).toBeUndefined();
    });

    it("throws if no domain configured", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: null,
      });

      await expect(getEmailDomainStatus("team-1")).rejects.toThrow(
        "No email domain configured for this team",
      );
    });

    it("throws if Resend API fails", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomainId: "dom_abc",
        emailDomain: "mail.example.com",
        emailDomainStatus: "pending",
        emailDomainDnsRecords: [],
      });

      mockDomainsGet.mockResolvedValue({
        data: null,
        error: { message: "Rate limited" },
      });

      await expect(getEmailDomainStatus("team-1")).rejects.toThrow(
        "Failed to get domain status: Rate limited",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // removeEmailDomain
  // ---------------------------------------------------------------------------

  describe("removeEmailDomain", () => {
    it("removes domain from Resend and clears DB fields", async () => {
      mockTeamFindUnique.mockResolvedValue({ emailDomainId: "dom_abc" });
      mockDomainsRemove.mockResolvedValue({});
      mockTeamUpdate.mockResolvedValue({});

      await removeEmailDomain("team-1");

      expect(mockDomainsRemove).toHaveBeenCalledWith("dom_abc");
      expect(mockTeamUpdate).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: expect.objectContaining({
          emailDomainId: null,
          emailDomain: null,
          emailDomainStatus: null,
          emailFromName: null,
          emailFromAddress: null,
          emailReplyTo: null,
          emailDomainVerifiedAt: null,
        }),
      });
    });

    it("clears DB even if Resend delete fails", async () => {
      mockTeamFindUnique.mockResolvedValue({ emailDomainId: "dom_abc" });
      mockDomainsRemove.mockRejectedValue(new Error("Resend API down"));
      mockTeamUpdate.mockResolvedValue({});

      // Should NOT throw
      await removeEmailDomain("team-1");

      expect(mockTeamUpdate).toHaveBeenCalled();
    });

    it("throws if no domain configured", async () => {
      mockTeamFindUnique.mockResolvedValue({ emailDomainId: null });

      await expect(removeEmailDomain("team-1")).rejects.toThrow(
        "No email domain configured for this team",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateEmailFromSettings
  // ---------------------------------------------------------------------------

  describe("updateEmailFromSettings", () => {
    it("updates from name, address, and reply-to", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomain: "mail.example.com",
        emailDomainStatus: "verified",
      });

      mockTeamUpdate.mockResolvedValue({});

      await updateEmailFromSettings("team-1", {
        fromName: "Bermuda Club",
        fromAddress: "investors",
        replyTo: "support@bermudaclub.com",
      });

      expect(mockTeamUpdate).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: {
          emailFromName: "Bermuda Club",
          emailFromAddress: "investors",
          emailReplyTo: "support@bermudaclub.com",
        },
      });
    });

    it("updates only provided fields", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomain: "mail.example.com",
        emailDomainStatus: "verified",
      });

      mockTeamUpdate.mockResolvedValue({});

      await updateEmailFromSettings("team-1", { fromName: "New Name" });

      expect(mockTeamUpdate).toHaveBeenCalledWith({
        where: { id: "team-1" },
        data: { emailFromName: "New Name" },
      });
    });

    it("throws if no email domain configured", async () => {
      mockTeamFindUnique.mockResolvedValue({
        emailDomain: null,
        emailDomainStatus: null,
      });

      await expect(
        updateEmailFromSettings("team-1", { fromName: "Test" }),
      ).rejects.toThrow("No email domain configured for this team");
    });
  });

  // ---------------------------------------------------------------------------
  // getTeamFromAddress
  // ---------------------------------------------------------------------------

  describe("getTeamFromAddress", () => {
    it("returns formatted from address for verified domain", async () => {
      mockTeamFindUnique.mockResolvedValue({
        name: "Bermuda Club Fund",
        emailDomain: "mail.bermudaclub.com",
        emailDomainStatus: "verified",
        emailFromName: "Bermuda Club",
        emailFromAddress: "investors",
        emailReplyTo: "support@bermudaclub.com",
      });

      const result = await getTeamFromAddress("team-1");

      expect(result).toEqual({
        from: "Bermuda Club <investors@mail.bermudaclub.com>",
        replyTo: "support@bermudaclub.com",
      });
    });

    it("uses team name when fromName is not set", async () => {
      mockTeamFindUnique.mockResolvedValue({
        name: "My Fund Co",
        emailDomain: "mail.myfund.com",
        emailDomainStatus: "verified",
        emailFromName: null,
        emailFromAddress: null,
        emailReplyTo: null,
      });

      const result = await getTeamFromAddress("team-1");

      expect(result).toEqual({
        from: "My Fund Co <notifications@mail.myfund.com>",
        replyTo: undefined,
      });
    });

    it("returns null if domain is not verified", async () => {
      mockTeamFindUnique.mockResolvedValue({
        name: "Test",
        emailDomain: "mail.test.com",
        emailDomainStatus: "pending",
        emailFromName: null,
        emailFromAddress: null,
        emailReplyTo: null,
      });

      const result = await getTeamFromAddress("team-1");
      expect(result).toBeNull();
    });

    it("returns null if no domain configured", async () => {
      mockTeamFindUnique.mockResolvedValue({
        name: "Test",
        emailDomain: null,
        emailDomainStatus: null,
        emailFromName: null,
        emailFromAddress: null,
        emailReplyTo: null,
      });

      const result = await getTeamFromAddress("team-1");
      expect(result).toBeNull();
    });
  });
});
