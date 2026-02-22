import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { determineCurrentStage, STAGE_INFO } from "@/lib/investor/approval-pipeline";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/investors/[investorId]
 *
 * GP admin retrieves full investor profile with entity data, compliance status,
 * investments, documents, and stage history.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ investorId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const { investorId } = await params;
    if (!investorId) {
      return NextResponse.json(
        { error: "Investor ID required" },
        { status: 400 },
      );
    }

    // Verify GP access
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        teams: { select: { teamId: true, role: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 403 },
      );
    }

    const isGP = user.teams.some(
      (t) => t.role === "ADMIN" || t.role === "OWNER",
    );
    if (!isGP) {
      return NextResponse.json(
        { error: "GP access required" },
        { status: 403 },
      );
    }

    const teamIds = user.teams.map((t) => t.teamId);

    // Fetch investor with related data
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        investments: {
          include: {
            fund: { select: { id: true, name: true, teamId: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        manualInvestments: {
          include: {
            fund: { select: { id: true, name: true, teamId: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    // Verify the investor belongs to a fund in one of the GP's teams
    const allTeamIds = [
      ...investor.investments.map((inv) => inv.fund.teamId),
      ...investor.manualInvestments.map((inv) => inv.fund.teamId),
    ];

    let hasAccess = allTeamIds.some((tid) => teamIds.includes(tid));

    // Fallback: check if investor's direct fundId links to GP's team
    if (!hasAccess && investor.fundId) {
      const linkedFund = await prisma.fund.findFirst({
        where: { id: investor.fundId, teamId: { in: teamIds } },
        select: { id: true },
      });
      hasAccess = !!linkedFund;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 },
      );
    }

    // Get KYC status
    let kycStatus = "NOT_STARTED";
    let kycVerifiedAt: string | null = null;
    try {
      const personaData = await prisma.$queryRaw<
        Array<{
          personaStatus: string;
          personaVerifiedAt: Date | null;
        }>
      >`
        SELECT "personaStatus", "personaVerifiedAt"
        FROM "Investor"
        WHERE id = ${investor.id}
        LIMIT 1
      `;
      if (personaData[0]) {
        kycStatus = personaData[0].personaStatus || "NOT_STARTED";
        kycVerifiedAt =
          personaData[0].personaVerifiedAt?.toISOString() || null;
      }
    } catch {
      // personaStatus column may not exist yet
    }

    // Determine current stage from investor data
    const fundData = (investor.fundData as Record<string, unknown>) || {};
    const stage = determineCurrentStage({
      accreditationStatus: investor.accreditationStatus,
      onboardingStep: investor.onboardingStep ?? 0,
      onboardingCompletedAt: investor.onboardingCompletedAt,
      fundData,
    });

    // Extract stage history from fundData
    const stageHistory = Array.isArray(fundData.approvalHistory)
      ? (fundData.approvalHistory as Array<{
          from: string;
          to: string;
          timestamp: string;
          by: string;
          notes?: string;
        }>)
      : [];

    // Get teamId from first investment
    const teamId =
      investor.investments[0]?.fund.teamId ||
      investor.manualInvestments[0]?.fund.teamId ||
      teamIds[0] ||
      "";

    // Combine regular + manual investments for the response
    const allInvestments = [
      ...investor.investments.map((inv) => ({
        id: inv.id,
        fundId: inv.fund.id,
        fundName: inv.fund.name,
        commitmentAmount: Number(inv.commitmentAmount),
        fundedAmount: Number(inv.fundedAmount),
        transferStatus: inv.status,
        proofStatus: "NOT_REQUIRED",
        createdAt: inv.createdAt.toISOString(),
      })),
      ...investor.manualInvestments.map((inv) => ({
        id: inv.id,
        fundId: inv.fund.id,
        fundName: inv.fund.name,
        commitmentAmount: Number(inv.commitmentAmount),
        fundedAmount: Number(inv.fundedAmount),
        transferStatus: inv.transferStatus,
        proofStatus: inv.proofStatus,
        createdAt: inv.createdAt.toISOString(),
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return NextResponse.json({
      id: investor.id,
      name: investor.user?.name || investor.entityName || "Unknown",
      email: investor.user?.email || "",
      phone: (fundData.phone as string) || null,
      entityName: investor.entityName,
      entityType: investor.entityType,
      ndaSigned: investor.ndaSigned,
      ndaSignedAt: investor.ndaSignedAt?.toISOString() || null,
      accreditationStatus: investor.accreditationStatus,
      accreditationType: investor.accreditationType,
      kycStatus,
      kycVerifiedAt,
      fundData: investor.fundData,
      createdAt: investor.createdAt.toISOString(),
      investments: allInvestments,
      documents: (
        investor.documents || []
      ).map(
        (doc: {
          id: string;
          title: string;
          documentType: string;
          signedAt: Date | null;
          createdAt: Date;
        }) => ({
          id: doc.id,
          name: doc.title || "Document",
          type: doc.documentType || "UNKNOWN",
          status: doc.signedAt ? "SIGNED" : "PENDING",
          createdAt: doc.createdAt.toISOString(),
        }),
      ),
      stage,
      stageHistory,
      teamId,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Admin investor profile error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
