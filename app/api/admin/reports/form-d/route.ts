import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/audit-logger";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/form-d?fundId=xxx&format=csv
 *
 * Exports Form D filing data as CSV or JSON.
 * Reference: SEC Form D (OMB 3235-0076)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fundId = searchParams.get("fundId");
  const format = searchParams.get("format");

  if (!fundId) {
    return NextResponse.json(
      { error: "fundId is required" },
      { status: 400 },
    );
  }

  try {
    // Load fund with full org/team context
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      include: {
        team: {
          include: {
            organization: true,
            users: {
              where: {
                role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
                status: "ACTIVE",
              },
              include: { user: { select: { name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const auth = await requireAdminAppRouter(fund.teamId);
    if (auth instanceof NextResponse) return auth;

    const org = fund.team.organization;

    // Get all investors with investment data
    const investors = await prisma.investor.findMany({
      where: { fundId },
      include: {
        user: { select: { name: true, email: true } },
        investments: {
          where: { fundId },
          select: {
            commitmentAmount: true,
            fundedAmount: true,
            status: true,
            subscriptionDate: true,
          },
        },
      },
    });

    // Calculate investor counts by accreditation method
    const accreditationCounts = {
      selfCertified: 0,
      kycVerified: 0,
      thirdPartyVerified: 0,
      pending: 0,
      nonAccredited: 0,
      total: investors.length,
    };

    let totalAmountSold = 0;
    let totalAmountRemaining = 0;
    let firstSaleDate: Date | null = null;
    let investorCountAccredited = 0;
    let investorCountNonAccredited = 0;

    for (const investor of investors) {
      switch (investor.accreditationStatus) {
        case "SELF_CERTIFIED":
          accreditationCounts.selfCertified++;
          investorCountAccredited++;
          break;
        case "KYC_VERIFIED":
          accreditationCounts.kycVerified++;
          investorCountAccredited++;
          break;
        case "THIRD_PARTY_VERIFIED":
          accreditationCounts.thirdPartyVerified++;
          investorCountAccredited++;
          break;
        case "PENDING":
          accreditationCounts.pending++;
          break;
        default:
          accreditationCounts.nonAccredited++;
          investorCountNonAccredited++;
      }

      for (const inv of investor.investments) {
        const funded = Number(inv.fundedAmount) || 0;
        totalAmountSold += funded;

        if (inv.subscriptionDate) {
          if (!firstSaleDate || inv.subscriptionDate < firstSaleDate) {
            firstSaleDate = inv.subscriptionDate;
          }
        }
      }
    }

    const targetRaise = Number(fund.targetRaise) || 0;
    totalAmountRemaining = Math.max(0, targetRaise - totalAmountSold);

    // Get GP admins for Related Persons section
    const orgRelatedPersons = org?.relatedPersons as Array<{
      name: string;
      title?: string;
      address?: string;
      relationship?: string;
    }> | null;
    const relatedPersons =
      orgRelatedPersons &&
      Array.isArray(orgRelatedPersons) &&
      orgRelatedPersons.length > 0
        ? orgRelatedPersons
        : fund.team.users.map(
            (ut: {
              user: { name: string | null; email: string | null };
              role: string;
            }) => ({
              name: ut.user.name || "",
              email: ut.user.email || "",
              role: ut.role,
            }),
          );

    const filingDeadline = firstSaleDate
      ? new Date(firstSaleDate.getTime() + 15 * 24 * 60 * 60 * 1000)
      : null;

    // Build Form D data object
    const formDData = {
      issuer: {
        entityName: org?.name || fund.team.name || "",
        entityType: org?.entityType || "LLC",
        ein: "[ENCRYPTED - See admin panel]",
        yearOfIncorporation: org?.foundedYear || null,
        stateOfIncorporation: org?.addressState || "",
        jurisdictionOfIncorporation: org?.addressCountry || "US",
      },
      principalAddress: {
        street1: org?.addressLine1 || "",
        street2: org?.addressLine2 || "",
        city: org?.addressCity || "",
        state: org?.addressState || "",
        zip: org?.addressZip || "",
        country: org?.addressCountry || "US",
        phone: org?.phone || "",
      },
      relatedPersons,
      industryGroup: org?.sector || "Pooled Investment Fund",
      issuerSize: {
        revenueRange: "Decline to Disclose",
        aggregateNetAssetValue: "Decline to Disclose",
      },
      federalExemption: {
        regulationDExemption: fund.regulationDExemption || "506B",
        exemptionLabel: getExemptionLabel(
          fund.regulationDExemption || "506B",
        ),
        rule506b: fund.regulationDExemption === "506B",
        rule506c: fund.regulationDExemption === "506C",
        regulationAPlus: fund.regulationDExemption === "REG_A_PLUS",
        rule504: fund.regulationDExemption === "RULE_504",
      },
      filingType: fund.formDFilingDate ? "AMENDMENT" : "NEW_NOTICE",
      previousFilingDate: fund.formDFilingDate
        ? new Date(fund.formDFilingDate).toISOString().split("T")[0]
        : null,
      offeringDuration: {
        indefinite: false,
        longerThanOneYear: (fund.termYears || 0) > 1,
      },
      securitiesType:
        fund.entityMode === "STARTUP"
          ? getStartupSecurityType(fund.fundSubType)
          : "Pooled Investment Fund Interests",
      businessCombination: false,
      minimumInvestment: Number(fund.minimumInvestment) || 0,
      salesCompensation: [],
      offeringAmounts: {
        totalOfferingAmount: targetRaise,
        totalAmountSold,
        totalAmountRemaining,
        clarificationOfResponse: null,
      },
      investorCounts: {
        totalAlreadyInvested: investors.filter(
          (i: (typeof investors)[number]) =>
            i.investments.some(
              (inv: { fundedAmount: unknown }) =>
                Number(inv.fundedAmount) > 0,
            ),
        ).length,
        totalAccredited: investorCountAccredited,
        totalNonAccredited: investorCountNonAccredited,
        accreditationBreakdown: accreditationCounts,
      },
      salesCommissions: {
        totalSalesCommissions: fund.salesCommissions || "0",
        totalFindersFees: 0,
        clarification: null,
      },
      useOfProceeds: {
        generalDescription:
          fund.useOfProceeds || fund.description || "",
        estimated: true,
      },
      meta: {
        fundName: fund.name,
        fundId: fund.id,
        fundStatus: fund.status,
        fundMode: fund.entityMode || "FUND",
        fundSubType: fund.fundSubType || null,
        firstSaleDate: firstSaleDate?.toISOString().split("T")[0] || null,
        filingDeadline:
          filingDeadline?.toISOString().split("T")[0] || null,
        existingFilingDate: fund.formDFilingDate
          ? new Date(fund.formDFilingDate).toISOString().split("T")[0]
          : null,
        amendmentDue: fund.formDAmendmentDue
          ? new Date(fund.formDAmendmentDue).toISOString().split("T")[0]
          : null,
        exportDate: new Date().toISOString().split("T")[0],
        exportedBy: auth.email,
        managementFeePct: fund.managementFeePct
          ? Number(fund.managementFeePct)
          : null,
        carryPct: fund.carryPct ? Number(fund.carryPct) : null,
        hurdleRate: fund.hurdleRate ? Number(fund.hurdleRate) : null,
        termYears: fund.termYears || null,
      },
    };

    // Audit log the export
    logAuditEvent({
      eventType: "DATA_EXPORT",
      userId: auth.userId,
      teamId: fund.teamId,
      resourceType: "Fund",
      resourceId: fundId,
      metadata: { exportType: "FORM_D", format: format || "json" },
    }).catch((e) => reportError(e as Error));

    // Return as CSV or JSON
    if (format === "csv") {
      const csvContent = buildFormDCsv(formDData);
      const filename = `form-d-${fund.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}`;

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
        },
      });
    }

    return NextResponse.json({ formD: formDData });
  } catch (error) {
    reportError(error as Error);
    console.error("[FORM_D_EXPORT] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function getExemptionLabel(exemption: string): string {
  switch (exemption) {
    case "506B":
      return "Rule 506(b)";
    case "506C":
      return "Rule 506(c)";
    case "REG_A_PLUS":
      return "Regulation A+";
    case "RULE_504":
      return "Rule 504";
    default:
      return exemption;
  }
}

function getStartupSecurityType(fundSubType: string | null): string {
  switch (fundSubType) {
    case "SAFE":
      return "Simple Agreement for Future Equity (SAFE)";
    case "CONVERTIBLE_NOTE":
      return "Convertible Promissory Note";
    case "PRICED_EQUITY":
      return "Equity (Common/Preferred Stock)";
    case "SPV":
      return "Limited Liability Company Interests (SPV)";
    default:
      return "Other";
  }
}

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildFormDCsv(data: Record<string, unknown>): string {
  const lines: string[] = [];
  const d = data as any;

  lines.push("SEC FORM D — Data Export");
  lines.push(`Export Date,${d.meta.exportDate}`);
  lines.push(`Fund Name,${escapeCsv(d.meta.fundName)}`);
  lines.push(`Fund ID,${d.meta.fundId}`);
  lines.push("");

  lines.push("SECTION 1: ISSUER IDENTITY");
  lines.push(`Entity Name,${escapeCsv(d.issuer.entityName)}`);
  lines.push(`Entity Type,${escapeCsv(d.issuer.entityType)}`);
  lines.push(`EIN,${d.issuer.ein}`);
  lines.push(
    `Year of Incorporation,${d.issuer.yearOfIncorporation || "N/A"}`,
  );
  lines.push(
    `State of Incorporation,${escapeCsv(d.issuer.stateOfIncorporation)}`,
  );
  lines.push(
    `Jurisdiction,${escapeCsv(d.issuer.jurisdictionOfIncorporation)}`,
  );
  lines.push("");

  lines.push("SECTION 2: PRINCIPAL PLACE OF BUSINESS");
  lines.push(`Street 1,${escapeCsv(d.principalAddress.street1)}`);
  lines.push(`Street 2,${escapeCsv(d.principalAddress.street2)}`);
  lines.push(`City,${escapeCsv(d.principalAddress.city)}`);
  lines.push(`State,${escapeCsv(d.principalAddress.state)}`);
  lines.push(`ZIP,${escapeCsv(d.principalAddress.zip)}`);
  lines.push(`Country,${escapeCsv(d.principalAddress.country)}`);
  lines.push(`Phone,${escapeCsv(d.principalAddress.phone)}`);
  lines.push("");

  lines.push("SECTION 3: RELATED PERSONS");
  lines.push("Name,Email,Role");
  for (const person of d.relatedPersons) {
    lines.push(
      `${escapeCsv(person.name)},${escapeCsv(person.email)},${person.role}`,
    );
  }
  lines.push("");

  lines.push("SECTION 6: FEDERAL EXEMPTION");
  lines.push(`Exemption Type,${d.federalExemption.exemptionLabel}`);
  lines.push(
    `Rule 506(b),${d.federalExemption.rule506b ? "Yes" : "No"}`,
  );
  lines.push(
    `Rule 506(c),${d.federalExemption.rule506c ? "Yes" : "No"}`,
  );
  lines.push(
    `Regulation A+,${d.federalExemption.regulationAPlus ? "Yes" : "No"}`,
  );
  lines.push(
    `Rule 504,${d.federalExemption.rule504 ? "Yes" : "No"}`,
  );
  lines.push("");

  lines.push("SECTION 7: TYPE OF FILING");
  lines.push(
    `Filing Type,${d.filingType === "NEW_NOTICE" ? "New Notice" : "Amendment"}`,
  );
  lines.push(`Previous Filing Date,${d.previousFilingDate || "N/A"}`);
  lines.push("");

  lines.push("SECTION 9: SECURITIES TYPE");
  lines.push(`Type,${escapeCsv(d.securitiesType)}`);
  lines.push("");

  lines.push("SECTION 11: MINIMUM INVESTMENT");
  lines.push(
    `Minimum Investment,$${d.minimumInvestment.toLocaleString()}`,
  );
  lines.push("");

  lines.push("SECTION 13: OFFERING AND SALES AMOUNTS");
  lines.push(
    `Total Offering Amount,$${d.offeringAmounts.totalOfferingAmount.toLocaleString()}`,
  );
  lines.push(
    `Total Amount Sold,$${d.offeringAmounts.totalAmountSold.toLocaleString()}`,
  );
  lines.push(
    `Total Amount Remaining,$${d.offeringAmounts.totalAmountRemaining.toLocaleString()}`,
  );
  lines.push("");

  lines.push("SECTION 14: INVESTORS");
  lines.push(
    `Total Investors Already Invested,${d.investorCounts.totalAlreadyInvested}`,
  );
  lines.push(
    `Total Accredited Investors,${d.investorCounts.totalAccredited}`,
  );
  lines.push(
    `Total Non-Accredited Investors,${d.investorCounts.totalNonAccredited}`,
  );
  lines.push("");
  lines.push("Accreditation Breakdown");
  lines.push(
    `Self-Certified,${d.investorCounts.accreditationBreakdown.selfCertified}`,
  );
  lines.push(
    `KYC Verified,${d.investorCounts.accreditationBreakdown.kycVerified}`,
  );
  lines.push(
    `Third-Party Verified,${d.investorCounts.accreditationBreakdown.thirdPartyVerified}`,
  );
  lines.push(
    `Pending,${d.investorCounts.accreditationBreakdown.pending}`,
  );
  lines.push(
    `Non-Accredited,${d.investorCounts.accreditationBreakdown.nonAccredited}`,
  );
  lines.push("");

  lines.push("SECTION 15: SALES COMMISSIONS & FINDERS' FEES");
  lines.push(
    `Total Sales Commissions,${escapeCsv(d.salesCommissions.totalSalesCommissions)}`,
  );
  lines.push(
    `Total Finders Fees,$${d.salesCommissions.totalFindersFees}`,
  );
  lines.push(
    `Clarification,${escapeCsv(d.salesCommissions.clarification || "N/A")}`,
  );
  lines.push("");

  lines.push("SECTION 16: USE OF PROCEEDS");
  lines.push(
    `General Description,${escapeCsv(d.useOfProceeds.generalDescription)}`,
  );
  lines.push(`Estimated,${d.useOfProceeds.estimated ? "Yes" : "No"}`);
  lines.push("");

  lines.push("KEY DATES");
  lines.push(`First Sale Date,${d.meta.firstSaleDate || "N/A"}`);
  lines.push(
    `Filing Deadline (15 days after first sale),${d.meta.filingDeadline || "N/A"}`,
  );
  lines.push(
    `Existing Filing Date,${d.meta.existingFilingDate || "N/A"}`,
  );
  lines.push(`Annual Amendment Due,${d.meta.amendmentDue || "N/A"}`);
  lines.push("");

  lines.push("FUND ECONOMICS");
  lines.push(
    `Management Fee,${d.meta.managementFeePct != null ? d.meta.managementFeePct + "%" : "N/A"}`,
  );
  lines.push(
    `Carried Interest,${d.meta.carryPct != null ? d.meta.carryPct + "%" : "N/A"}`,
  );
  lines.push(
    `Hurdle Rate,${d.meta.hurdleRate != null ? d.meta.hurdleRate + "%" : "N/A"}`,
  );
  lines.push(
    `Fund Term,${d.meta.termYears ? d.meta.termYears + " years" : "N/A"}`,
  );

  return lines.join("\n");
}
