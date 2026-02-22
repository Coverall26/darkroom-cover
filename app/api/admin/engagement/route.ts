import { NextRequest, NextResponse } from "next/server";

import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import {
  calculateEngagementScore,
  getFundEngagementSummary,
} from "@/lib/engagement/scoring";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/engagement?fundId=xxx           — Fund engagement summary
 * GET /api/admin/engagement?investorId=xxx        — Individual investor score
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const fundId = searchParams.get("fundId");
  const investorId = searchParams.get("investorId");

  try {
    if (investorId) {
      // Individual investor score — verify team access first
      const investor = await prisma.investor.findUnique({
        where: { id: investorId },
        select: {
          id: true,
          investments: {
            select: { fund: { select: { teamId: true } } },
            take: 1,
          },
        },
      });

      if (!investor) {
        return NextResponse.json(
          { error: "Investor not found" },
          { status: 404 },
        );
      }

      const investorTeamId =
        investor.investments[0]?.fund?.teamId ?? null;

      if (investorTeamId) {
        const userTeam = await prisma.userTeam.findFirst({
          where: {
            userId: auth.userId,
            teamId: investorTeamId,
            role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
            status: "ACTIVE",
          },
        });

        if (!userTeam) {
          return NextResponse.json(
            { error: "Forbidden" },
            { status: 403 },
          );
        }
      } else {
        // No fund association — check if investor has a direct fundId or
        // belongs to a fund in one of the requesting user's teams
        const userTeams = await prisma.userTeam.findMany({
          where: {
            userId: auth.userId,
            role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
            status: "ACTIVE",
          },
          select: { teamId: true },
        });

        if (userTeams.length === 0) {
          return NextResponse.json(
            { error: "Forbidden" },
            { status: 403 },
          );
        }

        // Check if investor's direct fundId is linked to user's teams
        const investorFull = await prisma.investor.findUnique({
          where: { id: investorId },
          select: { fundId: true },
        });

        if (investorFull?.fundId) {
          const fund = await prisma.fund.findUnique({
            where: { id: investorFull.fundId },
            select: { teamId: true },
          });
          const teamIds = userTeams.map((t: { teamId: string }) => t.teamId);
          if (!fund || !teamIds.includes(fund.teamId)) {
            return NextResponse.json(
              { error: "Forbidden" },
              { status: 403 },
            );
          }
        } else {
          // Investor truly has no fund link — forbid access
          return NextResponse.json(
            { error: "Forbidden" },
            { status: 403 },
          );
        }
      }

      const score = await calculateEngagementScore(investorId);
      return NextResponse.json({ score });
    }

    if (fundId) {
      // Fund-wide engagement summary
      const fund = await prisma.fund.findUnique({
        where: { id: fundId },
        select: { teamId: true },
      });

      if (!fund) {
        return NextResponse.json(
          { error: "Fund not found" },
          { status: 404 },
        );
      }

      // Verify access
      const userTeam = await prisma.userTeam.findFirst({
        where: {
          userId: auth.userId,
          teamId: fund.teamId,
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
          status: "ACTIVE",
        },
      });

      if (!userTeam) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 },
        );
      }

      const summary = await getFundEngagementSummary(fundId);
      return NextResponse.json({ summary });
    }

    return NextResponse.json(
      { error: "fundId or investorId required" },
      { status: 400 },
    );
  } catch (error) {
    reportError(error as Error);
    console.error("[ENGAGEMENT] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
