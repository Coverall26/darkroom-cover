import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { requireAdminAppRouter } from "@/lib/auth/rbac";
import type { AccreditationStatus, InvestmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Bulk Investor Import API (App Router)
 *
 * GET  /api/admin/investors/bulk-import — Returns CSV template
 * POST /api/admin/investors/bulk-import — Imports investor records
 */

const investorRowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  entityType: z
    .enum(["INDIVIDUAL", "LLC", "TRUST", "RETIREMENT", "OTHER"])
    .default("INDIVIDUAL"),
  entityName: z.string().optional(),
  commitmentAmount: z.number().positive(),
  commitmentDate: z.string().optional(),
  fundingStatus: z.enum(["COMMITTED", "FUNDED"]).default("COMMITTED"),
  accreditationStatus: z.string().default("SELF_CERTIFIED"),
  address: z.string().optional(),
  notes: z.string().optional(),
});

const bulkImportSchema = z.object({
  fundId: z.string(),
  teamId: z.string(),
  investors: z.array(investorRowSchema).min(1).max(500),
});

const CSV_TEMPLATE_COLUMNS = [
  "name",
  "email",
  "phone",
  "entityType",
  "entityName",
  "commitmentAmount",
  "commitmentDate",
  "fundingStatus",
  "accreditationStatus",
  "address",
  "notes",
];

export async function GET() {
  const csvHeader = CSV_TEMPLATE_COLUMNS.join(",");
  const csvExample = [
    "John Smith",
    "john@example.com",
    "+1-555-0100",
    "INDIVIDUAL",
    "",
    "100000",
    "2026-01-15",
    "COMMITTED",
    "SELF_CERTIFIED",
    "123 Main St, New York, NY 10001",
    "Referred by Jane",
  ].join(",");

  return new NextResponse(`${csvHeader}\n${csvExample}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition":
        "attachment; filename=investor-import-template.csv",
    },
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bulkImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid import data",
        errors: parsed.error.errors.map((e) => ({
          path: e.path.join("."),
          error: e.message,
        })),
      },
      { status: 400 },
    );
  }

  const { fundId, teamId, investors } = parsed.data;

  // Authenticate + authorize via RBAC (OWNER/ADMIN/SUPER_ADMIN)
  const auth = await requireAdminAppRouter(teamId);
  if (auth instanceof NextResponse) return auth;

  try {
    // Verify fund belongs to the authorized team
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { id: true, teamId: true, name: true },
    });

    if (!fund || fund.teamId !== teamId) {
      return NextResponse.json(
        { error: "Fund not found" },
        { status: 404 },
      );
    }

    // Process each investor
    const results: Array<{
      email: string;
      name: string;
      success: boolean;
      error?: string;
      investorId?: string;
    }> = [];

    for (const row of investors) {
      try {
        const user = await prisma.user.upsert({
          where: { email: row.email.toLowerCase() },
          update: { name: row.name },
          create: {
            email: row.email.toLowerCase(),
            name: row.name,
            role: "LP",
          },
        });

        const investor = await prisma.investor.upsert({
          where: { userId: user.id },
          update: {
            entityType: row.entityType,
            entityName: row.entityName || null,
            address: row.address || null,
            phone: row.phone || null,
            accreditationStatus:
              row.accreditationStatus as AccreditationStatus,
            fundData: {
              stage:
                row.fundingStatus === "FUNDED" ? "FUNDED" : "COMMITTED",
              manualEntry: true,
              bulkImport: true,
              enteredBy: auth.userId,
              enteredAt: new Date().toISOString(),
            },
          },
          create: {
            userId: user.id,
            fundId,
            entityType: row.entityType,
            entityName: row.entityName || null,
            address: row.address || null,
            phone: row.phone || null,
            accreditationStatus:
              row.accreditationStatus as AccreditationStatus,
            ndaSigned: true,
            ndaSignedAt: new Date(),
            onboardingStep: 5,
            onboardingCompletedAt: new Date(),
            fundData: {
              stage:
                row.fundingStatus === "FUNDED" ? "FUNDED" : "COMMITTED",
              manualEntry: true,
              bulkImport: true,
              enteredBy: auth.userId,
              enteredAt: new Date().toISOString(),
            },
          },
        });

        await prisma.investment.upsert({
          where: {
            fundId_investorId: {
              fundId,
              investorId: investor.id,
            },
          },
          update: {
            commitmentAmount: row.commitmentAmount,
            fundedAmount:
              row.fundingStatus === "FUNDED" ? row.commitmentAmount : 0,
            status: (row.fundingStatus === "FUNDED"
              ? "FUNDED"
              : "COMMITTED") as InvestmentStatus,
          },
          create: {
            fundId,
            investorId: investor.id,
            commitmentAmount: row.commitmentAmount,
            fundedAmount:
              row.fundingStatus === "FUNDED" ? row.commitmentAmount : 0,
            status: (row.fundingStatus === "FUNDED"
              ? "FUNDED"
              : "COMMITTED") as InvestmentStatus,
            subscriptionDate: row.commitmentDate
              ? new Date(row.commitmentDate)
              : new Date(),
          },
        });

        results.push({
          email: row.email,
          name: row.name,
          success: true,
          investorId: investor.id,
        });
      } catch {
        results.push({
          email: row.email,
          name: row.name,
          success: false,
          error: "Failed to create record",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    await logAuditEvent({
      eventType: "INVESTOR_IMPORT",
      userId: auth.userId,
      teamId,
      resourceType: "Fund",
      resourceId: fundId,
      metadata: {
        fundName: fund.name,
        totalRows: investors.length,
        succeeded,
        failed,
        bulkImport: true,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      message: `Import complete: ${succeeded} succeeded, ${failed} failed`,
      total: investors.length,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[BULK_IMPORT] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
