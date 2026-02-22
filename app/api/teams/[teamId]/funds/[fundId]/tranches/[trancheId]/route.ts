import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import prisma from "@/lib/prisma";
import {
  getTranche,
  transitionTrancheStatus,
  type TrancheStatus,
  TRANCHE_STATUSES,
} from "@/lib/funds/tranches";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string; trancheId: string }>;
};

/**
 * GET /api/teams/[teamId]/funds/[fundId]/tranches/[trancheId]
 * Get a single tranche with full details. GP only.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId, trancheId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const tranche = await getTranche(trancheId);

    if (!tranche || tranche.investment.fund.id !== fundId) {
      return NextResponse.json(
        { error: "Tranche not found" },
        { status: 404 },
      );
    }

    // Verify fund belongs to team
    if (tranche.investment.fund.teamId !== teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      tranche: {
        id: tranche.id,
        investmentId: tranche.investmentId,
        trancheNumber: tranche.trancheNumber,
        label: tranche.label,
        amount: Number(tranche.amount),
        fundedAmount: Number(tranche.fundedAmount),
        scheduledDate: tranche.scheduledDate.toISOString().split("T")[0],
        calledDate: tranche.calledDate?.toISOString().split("T")[0] || null,
        fundedDate: tranche.fundedDate?.toISOString().split("T")[0] || null,
        overdueDate: tranche.overdueDate?.toISOString().split("T")[0] || null,
        status: tranche.status,
        capitalCallId: tranche.capitalCallId,
        wireProofDocumentId: tranche.wireProofDocumentId,
        notes: tranche.notes,
        metadata: tranche.metadata,
        createdAt: tranche.createdAt.toISOString(),
        updatedAt: tranche.updatedAt.toISOString(),
      },
      investment: {
        id: tranche.investment.id,
        commitmentAmount: Number(tranche.investment.commitmentAmount),
        fundedAmount: Number(tranche.investment.fundedAmount),
        status: tranche.investment.status,
      },
      investor: {
        id: tranche.investment.investor.id,
        name:
          tranche.investment.investor.user?.name ||
          tranche.investment.investor.entityName ||
          "",
        email: tranche.investment.investor.user?.email || "",
      },
      fund: {
        id: tranche.investment.fund.id,
        name: tranche.investment.fund.name,
      },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    reportError(err, { context: "GET tranche detail" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/teams/[teamId]/funds/[fundId]/tranches/[trancheId]
 * Update tranche status (transition) or metadata. GP only.
 *
 * Body:
 *   status — New status (must be a valid transition)
 *   fundedAmount — Amount funded (for PARTIALLY_FUNDED)
 *   capitalCallId — Link to a capital call
 *   wireProofDocumentId — Link to wire proof document
 *   notes — GP notes
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId, trancheId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    // Verify tranche exists and belongs to this fund/team
    const existing = await getTranche(trancheId);
    if (!existing || existing.investment.fund.id !== fundId) {
      return NextResponse.json(
        { error: "Tranche not found" },
        { status: 404 },
      );
    }
    if (existing.investment.fund.teamId !== teamId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { status, fundedAmount, capitalCallId, wireProofDocumentId, notes } =
      body;

    if (status) {
      if (!TRANCHE_STATUSES.includes(status as TrancheStatus)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${TRANCHE_STATUSES.join(", ")}`,
          },
          { status: 400 },
        );
      }

      const result = await transitionTrancheStatus(
        trancheId,
        status as TrancheStatus,
        { fundedAmount, capitalCallId, wireProofDocumentId, notes },
      );

      if (!result.success) {
        return NextResponse.json({ error: "Invalid status transition" }, { status: 400 });
      }

      return NextResponse.json({ tranche: result.tranche });
    }

    // Non-status update (just notes/metadata)
    const updated = await prisma.investmentTranche.update({
      where: { id: trancheId },
      data: {
        ...(notes !== undefined ? { notes } : {}),
        ...(wireProofDocumentId !== undefined ? { wireProofDocumentId } : {}),
      },
    });

    return NextResponse.json({ tranche: updated });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    reportError(err, { context: "PATCH tranche status" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
