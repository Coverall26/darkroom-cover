import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getKycProvider, KYC_PROVIDER_TO_DB } from "@/lib/providers/kyc";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  const investorId = auth.investorId;
  if (!investorId) {
    return NextResponse.json(
      { error: "No investor profile found" },
      { status: 404 },
    );
  }

  try {
    const provider = getKycProvider();

    if (!provider.isConfigured()) {
      return NextResponse.json({
        configured: false,
        status: "NOT_CONFIGURED",
        message: "KYC verification is not configured",
        provider: provider.type,
      });
    }

    // Get investor KYC status with fund->team chain for org_id isolation
    const investors = await prisma.$queryRaw<
      Array<{
        id: string;
        fundId: string | null;
        personaInquiryId: string | null;
        personaStatus: string;
        personaVerifiedAt: Date | null;
        personaReferenceId: string | null;
      }>
    >`
      SELECT i.id, i."fundId", i."personaInquiryId", i."personaStatus", i."personaVerifiedAt", i."personaReferenceId"
      FROM "Investor" i
      WHERE i.id = ${investorId}
      LIMIT 1
    `;

    if (!investors || investors.length === 0) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    const investor = investors[0];

    // If there's an existing inquiry, get its current status from the provider
    if (investor.personaInquiryId && investor.personaStatus === "PENDING") {
      try {
        const statusResult = await provider.getStatus(
          investor.personaInquiryId,
        );
        const currentStatus = statusResult.status;

        // Update if status changed
        if (currentStatus !== investor.personaStatus) {
          await prisma.$executeRaw`
            UPDATE "Investor"
            SET "personaStatus" = ${currentStatus},
                "updatedAt" = NOW()
            WHERE id = ${investorId}
          `;
          investor.personaStatus = currentStatus;

          await logAuditEvent({
            eventType: "KYC_COMPLETED",
            resourceType: "Investor",
            resourceId: investorId,
            metadata: {
              previousStatus: "PENDING",
              newStatus: currentStatus,
              provider: provider.type,
            },
          });
        }
      } catch (err) {
        reportError(err instanceof Error ? err : new Error(String(err)), {
          context: "KYC status fetch",
          investorId,
        });
      }
    }

    const embeddedConfig = provider.getEmbeddedConfig();

    return NextResponse.json({
      configured: true,
      provider: provider.type,
      providerName: provider.name,
      status: investor.personaStatus,
      inquiryId: investor.personaInquiryId,
      verifiedAt: investor.personaVerifiedAt,
      environmentId: embeddedConfig.environmentId,
      templateId: embeddedConfig.templateId,
    });
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(String(error)), {
      context: "KYC GET handler",
      investorId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const authPost = await requireLPAuthAppRouter();
  if (authPost instanceof NextResponse) return authPost;

  const investorId = authPost.investorId;
  if (!investorId) {
    return NextResponse.json(
      { error: "No investor profile found" },
      { status: 404 },
    );
  }

  try {
    const provider = getKycProvider();

    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: "KYC verification is not configured" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { action } = body;

    // Get investor details with fund for org_id isolation
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
        fund: {
          select: {
            id: true,
            teamId: true,
          },
        },
      },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    // Get provider-specific fields using raw query
    const personaData = await prisma.$queryRaw<
      Array<{
        personaInquiryId: string | null;
        personaStatus: string;
      }>
    >`
      SELECT "personaInquiryId", "personaStatus"
      FROM "Investor"
      WHERE id = ${investorId}
      LIMIT 1
    `;

    const personaInfo = personaData[0];

    if (action === "start" || action === "resume") {
      // If there's an existing pending inquiry, resume it
      if (
        personaInfo?.personaInquiryId &&
        personaInfo.personaStatus === "PENDING"
      ) {
        try {
          const { sessionToken } = await provider.resumeSession(
            personaInfo.personaInquiryId,
          );
          const embeddedConfig = provider.getEmbeddedConfig();

          return NextResponse.json({
            action: "resume",
            provider: provider.type,
            inquiryId: personaInfo.personaInquiryId,
            sessionToken,
            environmentId: embeddedConfig.environmentId,
          });
        } catch (err) {
          reportError(err instanceof Error ? err : new Error(String(err)), {
            context: "KYC resume inquiry",
            investorId,
          });
          // Fall through to create new inquiry
        }
      }

      // Create new inquiry via the provider
      const nameParts = (investor.user.name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const referenceId = `inv_${investor.id}_${Date.now()}`;

      const kycSession = await provider.startVerification({
        referenceId,
        email: investor.user.email || "",
        firstName,
        lastName,
      });

      // Update investor with new inquiry
      await prisma.$executeRaw`
        UPDATE "Investor"
        SET "personaInquiryId" = ${kycSession.id},
            "personaReferenceId" = ${referenceId},
            "personaStatus" = ${kycSession.status},
            "updatedAt" = NOW()
        WHERE id = ${investorId}
      `;

      await logAuditEvent({
        eventType: "KYC_INITIATED",
        resourceType: "Investor",
        resourceId: investorId,
        teamId: investor.fund?.teamId,
        metadata: {
          provider: provider.type,
          inquiryId: kycSession.id,
          referenceId,
          requestAction: action,
        },
      });

      // Get session token for embedded flow
      let sessionToken = kycSession.sessionToken || "";
      if (!sessionToken && kycSession.id) {
        try {
          const resumed = await provider.resumeSession(kycSession.id);
          sessionToken = resumed.sessionToken;
        } catch {
          // sessionUrl-based providers don't need a token
          sessionToken = kycSession.sessionUrl || "";
        }
      }

      const embeddedConfig = provider.getEmbeddedConfig();
      const dbProviderName =
        KYC_PROVIDER_TO_DB[provider.type] || provider.type.toUpperCase();

      // Update AccreditationAck with KYC provider info if one exists
      await prisma.$executeRaw`
        UPDATE "AccreditationAck"
        SET "kycProvider" = ${dbProviderName},
            "kycVerificationId" = ${kycSession.id},
            "kycStatus" = ${kycSession.status}
        WHERE "investorId" = ${investorId}
          AND "completedAt" IS NOT NULL
          AND "kycVerificationId" IS NULL
        `;

      return NextResponse.json({
        action: "start",
        provider: provider.type,
        providerName: provider.name,
        inquiryId: kycSession.id,
        sessionToken,
        sessionUrl: kycSession.sessionUrl,
        environmentId: embeddedConfig.environmentId,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(String(error)), {
      context: "KYC POST handler",
      investorId,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
