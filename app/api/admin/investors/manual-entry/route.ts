import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { encryptTaxId } from "@/lib/crypto/secure-storage";
import { requireAdminAppRouter } from "@/lib/auth/rbac";
import { uploadInvestorDocument } from "@/lib/storage/investor-storage";
import { sendInvestorWelcomeEmailWithFund } from "@/lib/emails/send-investor-welcome";
import type { AccreditationStatus, InvestmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/investors/manual-entry
 *
 * Manual investor entry with atomic transaction.
 * Creates User, Investor, Investment, Transactions, and documents.
 */

const paymentSchema = z.object({
  amount: z.string().or(z.number()),
  dateReceived: z.string(),
  method: z.string().default("wire"),
  bankReference: z.string().optional(),
  notes: z.string().optional(),
});

const documentSchema = z.object({
  type: z.string(),
  filename: z.string(),
  dateSigned: z.string().optional(),
  fileData: z.string(), // base64
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
});

const manualEntrySchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  leadSource: z.string().optional(),
  entityType: z.enum(["INDIVIDUAL", "LLC", "TRUST", "RETIREMENT", "OTHER"]),
  entityName: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  accreditationStatus: z.string().default("SELF_CERTIFIED"),
  accreditationType: z.string().optional(),
  accreditationVerifierName: z.string().optional(),
  accreditationDate: z.string().optional(),
  minimumInvestmentThreshold: z.number().optional(),
  fundId: z.string(),
  commitmentAmount: z.number().positive().max(100_000_000_000),
  commitmentDate: z.string(),
  specialTerms: z.string().optional(),
  fundingStatus: z
    .enum(["COMMITTED", "PARTIALLY_FUNDED", "FUNDED"])
    .default("COMMITTED"),
  payments: z.array(paymentSchema).default([]),
  sendVaultAccess: z.boolean().default(true),
  notes: z.string().optional(),
  documents: z.array(documentSchema).default([]),
});

/**
 * Map string document type to LPDocumentType enum value.
 */
function mapDocType(
  type: string,
):
  | "NDA"
  | "SUBSCRIPTION_AGREEMENT"
  | "LPA"
  | "SIDE_LETTER"
  | "K1_TAX_FORM"
  | "ACCREDITATION_PROOF"
  | "FORMATION_DOCS"
  | "OTHER" {
  const mapping: Record<string, string> = {
    NDA: "NDA",
    SUBSCRIPTION_AGREEMENT: "SUBSCRIPTION_AGREEMENT",
    LPA: "LPA",
    SIDE_LETTER: "SIDE_LETTER",
    ACCREDITATION_PROOF: "ACCREDITATION_PROOF",
    ACCREDITATION_LETTER: "ACCREDITATION_PROOF",
    K1_TAX_FORM: "K1_TAX_FORM",
    TAX_FORM: "K1_TAX_FORM",
    FORMATION_DOCS: "FORMATION_DOCS",
    OPERATING_AGREEMENT: "FORMATION_DOCS",
  };
  return (mapping[type] || "OTHER") as ReturnType<typeof mapDocType>;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = manualEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid data" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const fullName = `${data.firstName} ${data.lastName}`.trim();

  try {
    // Verify fund exists
    const fund = await prisma.fund.findUnique({
      where: { id: data.fundId },
      select: { id: true, teamId: true, name: true },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Fund not found" },
        { status: 404 },
      );
    }

    // Authenticate + authorize via RBAC (OWNER/ADMIN/SUPER_ADMIN)
    const auth = await requireAdminAppRouter(fund.teamId);
    if (auth instanceof NextResponse) return auth;

    // Calculate total funded from payments
    const validPayments = data.payments.filter(
      (p) => Number(p.amount) > 0 && p.dateReceived,
    );
    const totalFunded = validPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );

    // Determine investment status based on funding
    let investmentStatus = "COMMITTED";
    let fundedAmount = 0;
    if (data.fundingStatus === "FUNDED") {
      investmentStatus = "FUNDED";
      fundedAmount =
        totalFunded > 0 ? totalFunded : data.commitmentAmount;
    } else if (data.fundingStatus === "PARTIALLY_FUNDED") {
      investmentStatus =
        totalFunded > 0 ? "PARTIALLY_FUNDED" : "COMMITTED";
      fundedAmount = totalFunded;
    }

    const approvalStage =
      investmentStatus === "FUNDED"
        ? "FUNDED"
        : investmentStatus === "PARTIALLY_FUNDED"
          ? "COMMITTED"
          : "COMMITTED";

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    // --- Transaction: create all records atomically ---
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert User
      let user = await tx.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            email: data.email.toLowerCase(),
            name: fullName,
            role: "LP",
          },
        });
      }

      // 2. Upsert Investor Profile
      let investor = await tx.investor.findUnique({
        where: { userId: user.id },
      });

      if (!investor) {
        investor = await tx.investor.create({
          data: {
            userId: user.id,
            fundId: data.fundId,
            entityType: data.entityType,
            entityName: data.entityName || null,
            taxId: data.taxId ? encryptTaxId(data.taxId) : null,
            address: data.address || null,
            phone: data.phone || null,
            accreditationStatus:
              data.accreditationStatus as AccreditationStatus,
            accreditationType: data.accreditationType || null,
            leadSource: data.leadSource || "MANUAL_ADD",
            ndaSigned: true,
            ndaSignedAt: new Date(),
            onboardingStep: 7,
            onboardingCompletedAt: new Date(),
            fundData: {
              stage: approvalStage,
              manualEntry: true,
              enteredBy: auth.userId,
              enteredAt: new Date().toISOString(),
              leadSource: data.leadSource || "MANUAL_ADD",
              notes: data.notes || null,
              specialTerms: data.specialTerms || null,
              accreditationVerifierName:
                data.accreditationVerifierName || null,
              accreditationDate: data.accreditationDate || null,
              minimumInvestmentThreshold:
                data.minimumInvestmentThreshold || null,
              approvalStage,
              approvalHistory: [
                {
                  stage: approvalStage,
                  timestamp: new Date().toISOString(),
                  actor: auth.userId,
                  action: "MANUAL_ENTRY",
                },
              ],
            },
          },
        });
      } else {
        investor = await tx.investor.update({
          where: { id: investor.id },
          data: {
            fundId: data.fundId,
            entityType: data.entityType,
            entityName: data.entityName || investor.entityName,
            taxId: data.taxId
              ? encryptTaxId(data.taxId)
              : investor.taxId,
            address: data.address || investor.address,
            phone: data.phone || investor.phone,
            leadSource:
              data.leadSource || investor.leadSource || "MANUAL_ADD",
            ndaSigned: true,
            ndaSignedAt: investor.ndaSignedAt || new Date(),
            onboardingStep: Math.max(
              investor.onboardingStep || 0,
              7,
            ),
            onboardingCompletedAt:
              investor.onboardingCompletedAt || new Date(),
          },
        });
      }

      // 3. Create Investment record
      const investment = await tx.investment.create({
        data: {
          fundId: data.fundId,
          investorId: investor.id,
          commitmentAmount: data.commitmentAmount,
          fundedAmount,
          status: investmentStatus as InvestmentStatus,
          subscriptionDate: new Date(data.commitmentDate),
        },
      });

      // 4. Create Transaction records for each payment
      const transactionIds: string[] = [];
      for (const payment of validPayments) {
        const amount = Number(payment.amount);
        const transaction = await tx.transaction.create({
          data: {
            investorId: investor.id,
            fundId: data.fundId,
            type: "CAPITAL_CALL",
            amount,
            status: "COMPLETED",
            description: `Manual entry payment — ${payment.method || "wire"}`,
            fundsReceivedDate: new Date(payment.dateReceived),
            confirmedBy: auth.userId,
            confirmedAt: new Date(),
            confirmationMethod: "MANUAL",
            bankReference: payment.bankReference || null,
            confirmationNotes: payment.notes || null,
            completedAt: new Date(payment.dateReceived),
            initiatedBy: auth.userId,
            ipAddress,
            userAgent,
            metadata: {
              source: "manual_investor_entry",
              investmentId: investment.id,
              paymentMethod: payment.method || "wire",
            },
          },
        });
        transactionIds.push(transaction.id);
      }

      // 5. Update FundAggregate totals
      const fundedAgg = await tx.investment.aggregate({
        where: {
          fundId: data.fundId,
          status: { notIn: ["CANCELLED", "DECLINED", "WITHDRAWN"] },
        },
        _sum: { fundedAmount: true, commitmentAmount: true },
      });
      const totalInboundNow = Number(fundedAgg._sum.fundedAmount ?? 0);
      const totalCommittedNow = Number(
        fundedAgg._sum.commitmentAmount ?? 0,
      );

      await tx.fundAggregate.upsert({
        where: { fundId: data.fundId },
        create: {
          fundId: data.fundId,
          totalCommitted: totalCommittedNow,
          totalInbound: totalInboundNow,
        },
        update: {
          totalInbound: totalInboundNow,
          totalCommitted: totalCommittedNow,
        },
      });

      return {
        user,
        investor,
        investment,
        transactionIds,
      };
    });

    // 6. Upload documents (outside transaction — fire-and-forget for storage)
    const documentIds: string[] = [];
    for (const doc of data.documents) {
      try {
        const { path } = await uploadInvestorDocument(
          result.investor.id,
          doc.type,
          doc.fileData,
          doc.filename,
        );

        const docTypeEnum = mapDocType(doc.type);

        const lpDoc = await prisma.lPDocument.create({
          data: {
            investorId: result.investor.id,
            fundId: data.fundId,
            title: doc.filename,
            documentType: docTypeEnum,
            status: "APPROVED",
            storageKey: path,
            storageType:
              process.env.STORAGE_PROVIDER === "vercel"
                ? "VERCEL_BLOB"
                : "S3_PATH",
            originalFilename: doc.filename,
            fileSize: BigInt(doc.fileSize || 0),
            mimeType: doc.mimeType || "application/pdf",
            uploadSource: "GP_UPLOADED_FOR_LP",
            uploadedByUserId: auth.userId,
            isOfflineSigned: true,
            externalSigningDate: doc.dateSigned
              ? new Date(doc.dateSigned)
              : null,
            reviewedByUserId: auth.userId,
            reviewedAt: new Date(),
            reviewNotes:
              "Auto-approved: uploaded by GP during manual entry",
          },
        });
        documentIds.push(lpDoc.id);
      } catch (docError) {
        reportError(docError as Error);
        console.error(
          `[MANUAL_ENTRY] Failed to upload document ${doc.type}:`,
          docError,
        );
      }
    }

    // 7. Send vault access email (fire-and-forget)
    if (data.sendVaultAccess) {
      sendInvestorWelcomeEmailWithFund(
        result.user.id,
        data.fundId,
      ).catch((err) => {
        console.error(
          "[MANUAL_ENTRY] Failed to send welcome email:",
          err,
        );
      });
    }

    // 8. Audit log
    await logAuditEvent({
      eventType: "INVESTOR_MANUAL_ENTRY",
      userId: auth.userId,
      teamId: fund.teamId,
      resourceType: "Investor",
      resourceId: result.investor.id,
      metadata: {
        investmentId: result.investment.id,
        fundId: data.fundId,
        fundName: fund.name,
        investorName: fullName,
        commitmentAmount: data.commitmentAmount,
        fundedAmount,
        fundingStatus: data.fundingStatus,
        entityType: data.entityType,
        leadSource: data.leadSource || "MANUAL_ADD",
        transactionCount: result.transactionIds.length,
        documentCount: documentIds.length,
        vaultAccessSent: data.sendVaultAccess,
        manualEntry: true,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json(
      {
        investorId: result.investor.id,
        investmentId: result.investment.id,
        userId: result.user.id,
        transactionIds: result.transactionIds,
        documentIds,
      },
      { status: 201 },
    );
  } catch (error) {
    reportError(error as Error);
    console.error("[MANUAL_ENTRY] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
