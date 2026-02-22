import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/export?fundId=xxx&format=csv
 *
 * Exports fund report data as CSV download.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fundId = searchParams.get("fundId");
  if (!fundId) {
    return NextResponse.json(
      { error: "fundId is required" },
      { status: 400 },
    );
  }

  try {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: {
        id: true,
        name: true,
        targetRaise: true,
        teamId: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId: fund.teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all investors for this fund with investment data
    const investors = await prisma.investor.findMany({
      where: { fundId },
      include: {
        user: {
          select: { name: true, email: true },
        },
        investments: {
          where: { fundId },
          select: {
            commitmentAmount: true,
            fundedAmount: true,
            status: true,
          },
        },
      },
    });

    // Build investor rows
    const rows = investors.map((investor) => {
      const fundData = investor.fundData as Record<string, unknown> | null;
      const stage = (fundData?.stage as string) || "APPLIED";
      const totalCommitted = investor.investments.reduce(
        (sum, inv) => sum + (Number(inv.commitmentAmount) || 0),
        0,
      );
      const totalFunded = investor.investments.reduce(
        (sum, inv) => sum + (Number(inv.fundedAmount) || 0),
        0,
      );

      return {
        name: investor.user?.name || investor.entityName || "",
        email: investor.user?.email || "",
        stage,
        entityType: investor.entityType || "INDIVIDUAL",
        accreditationStatus: investor.accreditationStatus || "",
        ndaSigned: investor.ndaSigned ? "Yes" : "No",
        totalCommitted,
        totalFunded,
        onboardingStep: investor.onboardingStep,
        createdAt: investor.createdAt.toISOString().split("T")[0],
      };
    });

    // Calculate summary
    const stages = {
      applied: 0,
      underReview: 0,
      approved: 0,
      committed: 0,
      funded: 0,
      rejected: 0,
    };

    let totalCommitted = 0;
    let totalFunded = 0;

    for (const row of rows) {
      switch (row.stage) {
        case "APPLIED":
          stages.applied++;
          break;
        case "UNDER_REVIEW":
          stages.underReview++;
          break;
        case "APPROVED":
          stages.approved++;
          break;
        case "COMMITTED":
          stages.committed++;
          break;
        case "FUNDED":
          stages.funded++;
          break;
        case "REJECTED":
          stages.rejected++;
          break;
        default:
          stages.applied++;
      }
      totalCommitted += row.totalCommitted;
      totalFunded += row.totalFunded;
    }

    // Generate CSV
    const csvLines: string[] = [];

    // Summary section
    csvLines.push("Fund Report Export");
    csvLines.push(`Fund Name,${escapeCsv(fund.name)}`);
    csvLines.push(
      `Target Raise,$${Number(fund.targetRaise || 0).toLocaleString()}`,
    );
    csvLines.push(`Total Committed,$${totalCommitted.toLocaleString()}`);
    csvLines.push(`Total Funded,$${totalFunded.toLocaleString()}`);
    csvLines.push(`Total Investors,${rows.length}`);
    csvLines.push(
      `Export Date,${new Date().toISOString().split("T")[0]}`,
    );
    csvLines.push("");

    // Pipeline summary
    csvLines.push("Pipeline Distribution");
    csvLines.push("Stage,Count");
    csvLines.push(`Applied,${stages.applied}`);
    csvLines.push(`Under Review,${stages.underReview}`);
    csvLines.push(`Approved,${stages.approved}`);
    csvLines.push(`Committed,${stages.committed}`);
    csvLines.push(`Funded,${stages.funded}`);
    csvLines.push(`Rejected,${stages.rejected}`);
    csvLines.push("");

    // Investor details
    csvLines.push("Investor Details");
    csvLines.push(
      "Name,Email,Stage,Entity Type,Accreditation,NDA Signed,Committed,Funded,Onboarding Step,Created",
    );

    for (const row of rows) {
      csvLines.push(
        [
          escapeCsv(row.name),
          escapeCsv(row.email),
          row.stage,
          row.entityType,
          row.accreditationStatus,
          row.ndaSigned,
          row.totalCommitted,
          row.totalFunded,
          row.onboardingStep,
          row.createdAt,
        ].join(","),
      );
    }

    const csvContent = csvLines.join("\n");
    const filename = `fund-report-${fund.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[REPORTS_EXPORT] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
