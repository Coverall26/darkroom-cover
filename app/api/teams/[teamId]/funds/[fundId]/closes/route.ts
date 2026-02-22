import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string }>;
};

/**
 * GET /api/teams/[teamId]/funds/[fundId]/closes
 * List all closing rounds for a fund. GP only.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true, name: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const closes = await prisma.fundClose.findMany({
      where: { fundId },
      include: {
        investments: {
          select: {
            id: true,
            commitmentAmount: true,
            fundedAmount: true,
            status: true,
            investor: {
              select: {
                id: true,
                entityName: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: { closeNumber: "asc" },
    });

    return NextResponse.json({
      fund: { id: fund.id, name: fund.name },
      closes: closes.map((c) => ({
        id: c.id,
        closeNumber: c.closeNumber,
        name: c.name,
        targetAmount: c.targetAmount ? Number(c.targetAmount) : null,
        actualAmount: Number(c.actualAmount),
        openDate: c.openDate.toISOString().split("T")[0],
        scheduledCloseDate: c.scheduledCloseDate?.toISOString().split("T")[0] || null,
        closeDate: c.closeDate?.toISOString().split("T")[0] || null,
        status: c.status,
        isFinal: c.isFinal,
        investorCount: c.investments.length,
        investments: c.investments.map((inv) => ({
          id: inv.id,
          commitmentAmount: Number(inv.commitmentAmount),
          fundedAmount: Number(inv.fundedAmount),
          status: inv.status,
          investorName:
            inv.investor.user?.name || inv.investor.entityName || "",
          investorEmail: inv.investor.user?.email || "",
        })),
      })),
      totalCloses: closes.length,
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    reportError(err, { context: "GET fund closes" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/teams/[teamId]/funds/[fundId]/closes
 * Create a new closing round. GP only.
 *
 * Body:
 *   name — Close name (e.g., "First Close")
 *   targetAmount — Optional target for this close
 *   scheduledCloseDate — Optional target close date (ISO string)
 *   isFinal — Whether this is the final close
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, targetAmount, scheduledCloseDate, isFinal } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Close name is required" },
        { status: 400 },
      );
    }

    // Determine next close number
    const lastClose = await prisma.fundClose.findFirst({
      where: { fundId },
      orderBy: { closeNumber: "desc" },
      select: { closeNumber: true, status: true },
    });

    // Don't allow new close if the last one is marked FINAL
    if (lastClose?.status === "FINAL") {
      return NextResponse.json(
        { error: "Cannot create a new close after a final close" },
        { status: 400 },
      );
    }

    const closeNumber = (lastClose?.closeNumber || 0) + 1;

    const fundClose = await prisma.fundClose.create({
      data: {
        fundId,
        closeNumber,
        name,
        targetAmount: targetAmount || null,
        scheduledCloseDate: scheduledCloseDate
          ? new Date(scheduledCloseDate)
          : null,
        isFinal: isFinal || false,
        closedBy: auth.userId,
      },
    });

    return NextResponse.json({ close: fundClose }, { status: 201 });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    reportError(err, { context: "POST create fund close" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
