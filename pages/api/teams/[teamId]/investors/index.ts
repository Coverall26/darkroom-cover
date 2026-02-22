import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { determineCurrentStage } from "@/lib/investor/approval-pipeline";
import { reportError } from "@/lib/error";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user?.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { teamId, fundId } = req.query as {
      teamId: string;
      fundId?: string;
    };

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        teams: {
          where: { teamId },
        },
      },
    });

    if (!user?.teams?.[0]) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Get funds for this team, optionally filtered
    const fundWhere = fundId
      ? { id: fundId, teamId }
      : { teamId };
    const funds = await prisma.fund.findMany({
      where: fundWhere,
      select: { id: true },
    });

    const fundIds = funds.map((f) => f.id);

    const investments = await prisma.manualInvestment.findMany({
      where: { fundId: { in: fundIds } },
      include: {
        investor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        fund: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Group by investor to aggregate across investments
    const investorMap = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        entityName: string | null;
        entityType: string | null;
        commitment: number;
        funded: number;
        status: string;
        stage: string;
        accreditationStatus: string | null;
        ndaSigned: boolean;
        leadSource: string | null;
        createdAt: string;
      }
    >();

    for (const inv of investments) {
      const existing = investorMap.get(inv.investorId);
      const fundData =
        (inv.investor.fundData as Record<string, unknown>) || {};
      const stage = determineCurrentStage({
        accreditationStatus: inv.investor.accreditationStatus,
        onboardingStep: (fundData.onboardingStep as number) || 0,
        fundData,
      });

      if (existing) {
        existing.commitment += Number(inv.commitmentAmount);
        existing.funded += Number(inv.fundedAmount);
      } else {
        investorMap.set(inv.investorId, {
          id: inv.investor.id,
          name:
            inv.investor.user?.name ||
            inv.investor.entityName ||
            "Unknown",
          email: inv.investor.user?.email || "",
          entityName: inv.investor.entityName,
          entityType: inv.investor.entityType,
          commitment: Number(inv.commitmentAmount),
          funded: Number(inv.fundedAmount),
          status: inv.transferStatus,
          stage,
          accreditationStatus: inv.investor.accreditationStatus,
          ndaSigned: inv.investor.ndaSigned,
          leadSource: inv.investor.leadSource || null,
          createdAt: inv.createdAt.toISOString(),
        });
      }
    }

    // Also include investors without manual investments but with regular investments
    const regularInvestments = await prisma.investment.findMany({
      where: { fundId: { in: fundIds } },
      include: {
        investor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      distinct: ["investorId"],
    });

    for (const inv of regularInvestments) {
      if (!investorMap.has(inv.investorId)) {
        const fundData =
          (inv.investor.fundData as Record<string, unknown>) || {};
        const stage = determineCurrentStage({
          accreditationStatus: inv.investor.accreditationStatus,
          onboardingStep: (fundData.onboardingStep as number) || 0,
          fundData,
        });

        investorMap.set(inv.investorId, {
          id: inv.investor.id,
          name:
            inv.investor.user?.name ||
            inv.investor.entityName ||
            "Unknown",
          email: inv.investor.user?.email || "",
          entityName: inv.investor.entityName,
          entityType: inv.investor.entityType,
          commitment: Number(inv.commitmentAmount || 0),
          funded: Number(inv.fundedAmount || 0),
          status: "PENDING",
          stage,
          accreditationStatus: inv.investor.accreditationStatus,
          ndaSigned: inv.investor.ndaSigned,
          leadSource: inv.investor.leadSource || null,
          createdAt: inv.createdAt.toISOString(),
        });
      }
    }

    const investors = Array.from(investorMap.values()).sort(
      (a, b) => b.commitment - a.commitment,
    );

    return res.status(200).json({ investors });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching investors:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
