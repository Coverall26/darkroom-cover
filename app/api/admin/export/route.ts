import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const EXPORTABLE_MODELS = [
  "fund",
  "fundAggregate",
  "investor",
  "investment",
  "capitalCall",
  "capitalCallResponse",
  "distribution",
  "fundReport",
  "investorNote",
  "investorDocument",
  "accreditationAck",
  "bankLink",
  "transaction",
  "subscription",
  "viewAudit",
  "signatureAudit",
  "auditLog",
] as const;

type ExportableModel = (typeof EXPORTABLE_MODELS)[number];

interface ExportData {
  metadata: {
    exportedAt: string;
    exportedBy: string;
    teamId: string;
    schemaVersion: string;
    modelCounts: Record<string, number>;
  };
  data: Record<string, any[]>;
}

/**
 * GET /api/admin/export
 *
 * Full team data export (JSON or CSV).
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = new URL(req.url).searchParams;
    const teamId = searchParams.get("teamId");
    const models = searchParams.getAll("models");
    const exportFormat = searchParams.get("format");

    if (!teamId) {
      return NextResponse.json({ error: "Team ID required" }, { status: 400 });
    }

    const auth = await requireAdminAppRouter(teamId);
    if (auth instanceof NextResponse) return auth;

    return await handleExport(req, auth, teamId, models, exportFormat);
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/export
 *
 * Full team data export (JSON or CSV) via POST body.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teamId, models, format: exportFormat } = body;

    if (!teamId || typeof teamId !== "string") {
      return NextResponse.json({ error: "Team ID required" }, { status: 400 });
    }

    const auth = await requireAdminAppRouter(teamId);
    if (auth instanceof NextResponse) return auth;

    const modelList = models
      ? (Array.isArray(models) ? models : [models])
      : [];

    return await handleExport(req, auth, teamId, modelList, exportFormat);
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleExport(
  req: NextRequest,
  auth: { userId: string; email: string; teamId: string },
  teamId: string,
  models: string[],
  exportFormat: string | null,
) {
  const modelsToExport: ExportableModel[] = models.length > 0
    ? models.filter((m: string) =>
        EXPORTABLE_MODELS.includes(m as ExportableModel)
      ) as ExportableModel[]
    : [...EXPORTABLE_MODELS];

  const exportData: ExportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      exportedBy: auth.email,
      teamId,
      schemaVersion: "1.0.0",
      modelCounts: {},
    },
    data: {},
  };

  const funds = await prisma.fund.findMany({
    where: { teamId },
  });
  const fundIds = funds.map((f: { id: string }) => f.id);

  const investorIds: string[] = [];

  if (modelsToExport.includes("fund")) {
    exportData.data.funds = funds;
    exportData.metadata.modelCounts.funds = funds.length;
  }

  if (modelsToExport.includes("fundAggregate")) {
    const aggregates = await prisma.fundAggregate.findMany({
      where: { fundId: { in: fundIds } },
    });
    exportData.data.fundAggregates = aggregates;
    exportData.metadata.modelCounts.fundAggregates = aggregates.length;
  }

  if (modelsToExport.includes("investment")) {
    const investments = await prisma.investment.findMany({
      where: { fundId: { in: fundIds } },
    });
    exportData.data.investments = investments;
    exportData.metadata.modelCounts.investments = investments.length;
    investorIds.push(...investments.map((i: { investorId: string }) => i.investorId));
  }

  const uniqueInvestorIds = [...new Set(investorIds)];

  if (modelsToExport.includes("investor") && uniqueInvestorIds.length > 0) {
    const investors = await prisma.investor.findMany({
      where: { id: { in: uniqueInvestorIds } },
    });
    exportData.data.investors = investors;
    exportData.metadata.modelCounts.investors = investors.length;
  }

  if (modelsToExport.includes("capitalCall")) {
    const capitalCalls = await prisma.capitalCall.findMany({
      where: { fundId: { in: fundIds } },
    });
    exportData.data.capitalCalls = capitalCalls;
    exportData.metadata.modelCounts.capitalCalls = capitalCalls.length;
  }

  if (modelsToExport.includes("capitalCallResponse")) {
    const responses = await prisma.capitalCallResponse.findMany({
      where: { investorId: { in: uniqueInvestorIds } },
    });
    exportData.data.capitalCallResponses = responses;
    exportData.metadata.modelCounts.capitalCallResponses = responses.length;
  }

  if (modelsToExport.includes("distribution")) {
    const distributions = await prisma.distribution.findMany({
      where: { fundId: { in: fundIds } },
    });
    exportData.data.distributions = distributions;
    exportData.metadata.modelCounts.distributions = distributions.length;
  }

  if (modelsToExport.includes("fundReport")) {
    const reports = await prisma.fundReport.findMany({
      where: { fundId: { in: fundIds } },
    });
    exportData.data.fundReports = reports;
    exportData.metadata.modelCounts.fundReports = reports.length;
  }

  if (modelsToExport.includes("investorNote")) {
    const notes = await prisma.investorNote.findMany({
      where: { teamId },
    });
    exportData.data.investorNotes = notes;
    exportData.metadata.modelCounts.investorNotes = notes.length;
  }

  if (modelsToExport.includes("investorDocument") && uniqueInvestorIds.length > 0) {
    const docs = await prisma.investorDocument.findMany({
      where: { investorId: { in: uniqueInvestorIds } },
    });
    exportData.data.investorDocuments = docs;
    exportData.metadata.modelCounts.investorDocuments = docs.length;
  }

  if (modelsToExport.includes("accreditationAck") && uniqueInvestorIds.length > 0) {
    const acks = await prisma.accreditationAck.findMany({
      where: { investorId: { in: uniqueInvestorIds } },
    });
    exportData.data.accreditationAcks = acks;
    exportData.metadata.modelCounts.accreditationAcks = acks.length;
  }

  if (modelsToExport.includes("bankLink") && uniqueInvestorIds.length > 0) {
    const links = await prisma.bankLink.findMany({
      where: { investorId: { in: uniqueInvestorIds } },
      select: {
        id: true,
        investorId: true,
        plaidItemId: true,
        plaidAccountId: true,
        institutionId: true,
        institutionName: true,
        accountName: true,
        accountMask: true,
        accountType: true,
        accountSubtype: true,
        status: true,
        transferEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    exportData.data.bankLinks = links;
    exportData.metadata.modelCounts.bankLinks = links.length;
  }

  if (modelsToExport.includes("transaction") && uniqueInvestorIds.length > 0) {
    const transactions = await prisma.transaction.findMany({
      where: { investorId: { in: uniqueInvestorIds } },
    });
    exportData.data.transactions = transactions;
    exportData.metadata.modelCounts.transactions = transactions.length;
  }

  if (modelsToExport.includes("subscription") && uniqueInvestorIds.length > 0) {
    const subscriptions = await prisma.subscription.findMany({
      where: { investorId: { in: uniqueInvestorIds } },
    });
    exportData.data.subscriptions = subscriptions;
    exportData.metadata.modelCounts.subscriptions = subscriptions.length;
  }

  // Get team document IDs for view/signature audits
  const teamDocuments = await prisma.document.findMany({
    where: { teamId },
    select: { id: true },
  });
  const documentIds = teamDocuments.map((d: { id: string }) => d.id);

  if (modelsToExport.includes("viewAudit") && documentIds.length > 0) {
    const viewAudits = await prisma.view.findMany({
      where: { documentId: { in: documentIds } },
      select: {
        id: true,
        documentId: true,
        viewerEmail: true,
        viewerName: true,
        viewType: true,
        ipAddress: true,
        userAgent: true,
        geoCountry: true,
        geoCity: true,
        viewedAt: true,
      },
    });
    exportData.data.viewAudits = viewAudits;
    exportData.metadata.modelCounts.viewAudits = viewAudits.length;
  }

  if (modelsToExport.includes("signatureAudit") && documentIds.length > 0) {
    const signatureAudits = await prisma.signatureAuditLog.findMany({
      where: { documentId: { in: documentIds } },
      select: {
        id: true,
        documentId: true,
        recipientEmail: true,
        event: true,
        ipAddress: true,
        userAgent: true,
        metadata: true,
        createdAt: true,
      },
    });
    exportData.data.signatureAudits = signatureAudits;
    exportData.metadata.modelCounts.signatureAudits = signatureAudits.length;
  }

  if (modelsToExport.includes("auditLog")) {
    const auditLogs = await prisma.auditLog.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });
    exportData.data.auditLogs = auditLogs;
    exportData.metadata.modelCounts.auditLogs = auditLogs.length;
  }

  await prisma.auditLog.create({
    data: {
      eventType: "DATA_EXPORT",
      userId: auth.userId,
      teamId,
      resourceType: "TEAM_DATA",
      resourceId: teamId,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0] || "",
      userAgent: req.headers.get("user-agent") || "",
      metadata: {
        models: modelsToExport,
        counts: exportData.metadata.modelCounts,
      },
    },
  }).catch((e: unknown) => reportError(e as Error));

  if (exportFormat === "csv") {
    const csvParts: string[] = [];

    for (const [modelName, records] of Object.entries(exportData.data)) {
      if (records.length === 0) continue;

      const headers = Object.keys(records[0]);
      csvParts.push(`# ${modelName.toUpperCase()}`);
      csvParts.push(headers.join(","));

      for (const record of records) {
        const row = headers.map((h: string) => {
          const val = record[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        });
        csvParts.push(row.join(","));
      }
      csvParts.push("");
    }

    return new NextResponse(csvParts.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="fund-data-export-${format(new Date(), "yyyy-MM-dd")}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(exportData), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="fund-data-export-${format(new Date(), "yyyy-MM-dd")}.json"`,
    },
  });
}
