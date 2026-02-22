import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { encryptTaxId } from "@/lib/crypto/secure-storage";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/lp/investor-details
 * Saves investor entity type and detailed information.
 * Handles all 7 entity types: Individual, Joint, Trust/Estate,
 * LLC/Corporation, Partnership, IRA/Retirement, Charity/Foundation.
 * Encrypts tax IDs (SSN/EIN) with AES-256.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const {
      fundId,
      entityType,
      entityName,
      entityData,
      taxId,
      taxIdType,
      address,
      authorizedSignerName,
      authorizedSignerTitle,
      authorizedSignerEmail,
    } = body;

    if (!entityType) {
      return NextResponse.json(
        { error: "Entity type is required" },
        { status: 400 },
      );
    }

    const validTypes = [
      "INDIVIDUAL",
      "JOINT",
      "TRUST",
      "LLC",
      "CORPORATION",
      "PARTNERSHIP",
      "IRA",
      "RETIREMENT",
      "CHARITY",
      "FOUNDATION",
      "OTHER",
    ];
    if (!validTypes.includes(entityType)) {
      return NextResponse.json(
        { error: "Invalid entity type" },
        { status: 400 },
      );
    }

    // Find the investor profile
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { investorProfile: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const investor = user.investorProfile;
    if (!investor) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    // Encrypt tax ID if provided
    const encryptedTaxId = taxId
      ? encryptTaxId(taxId.replace(/[-\s]/g, ""))
      : undefined;

    // Build update data
    const updateData: Record<string, unknown> = {
      entityType,
      entityName: entityName || null,
      entityData: entityData || null,
      onboardingStep: Math.max(investor.onboardingStep || 0, 4),
    };

    if (encryptedTaxId) {
      updateData.taxIdEncrypted = encryptedTaxId;
      updateData.taxIdType = taxIdType || (entityType === "INDIVIDUAL" || entityType === "JOINT" ? "SSN" : "EIN");
    }

    if (address) {
      updateData.address = address;
    }

    if (authorizedSignerName) {
      updateData.authorizedSignerName = authorizedSignerName;
    }
    if (authorizedSignerTitle) {
      updateData.authorizedSignerTitle = authorizedSignerTitle;
    }
    if (authorizedSignerEmail) {
      updateData.authorizedSignerEmail = authorizedSignerEmail;
    }

    await prisma.investor.update({
      where: { id: investor.id },
      data: updateData,
    });

    // Resolve teamId for audit
    const teamId = fundId
      ? (
          await prisma.fund.findUnique({
            where: { id: fundId },
            select: { teamId: true },
          })
        )?.teamId
      : null;

    await logAuditEvent({
      eventType: "INVESTOR_UPDATED",
      userId: auth.userId,
      teamId: teamId || undefined,
      resourceType: "Investor",
      resourceId: investor.id,
      metadata: {
        action: "investor_details_saved",
        entityType,
        fundId: fundId || null,
        hasTaxId: !!taxId,
        hasAddress: !!address,
      },
    });

    return NextResponse.json({
      success: true,
      investorId: investor.id,
      entityType,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
