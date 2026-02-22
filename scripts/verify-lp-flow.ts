/**
 * LP Flow Verification Script
 *
 * Tests and verifies the complete LP journey data chain at each step:
 *   1. Investor exists with fund association
 *   2. Investment/Commitment record
 *   3. Documents (LPDocument + SignatureDocument)
 *   4. Transactions (wire proofs)
 *   5. OnboardingFlow state
 *   6. Fund totals
 *
 * Usage:
 *   npx ts-node scripts/verify-lp-flow.ts                 # List all investors
 *   npx ts-node scripts/verify-lp-flow.ts <investorId>    # Verify specific investor
 */

import prisma from "../lib/prisma";

async function verifyLPFlow(investorId: string) {
  console.log("=== FundRoom LP Flow Verification ===\n");

  // 1. Check Investor exists
  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      fund: { select: { id: true, name: true, targetRaise: true, teamId: true } },
    },
  });

  if (!investor) {
    console.error("FAIL: Investor not found with ID:", investorId);
    return;
  }

  console.log(`OK: Investor: ${investor.user?.name || investor.user?.email}`);
  console.log(`   Email: ${investor.user?.email}`);
  console.log(`   Fund: ${investor.fund?.name || "NOT LINKED"}`);
  console.log(`   Fund ID: ${investor.fundId || "null"}`);
  console.log(`   Entity Type: ${investor.entityType}`);
  console.log(`   Accreditation: ${investor.accreditationStatus}`);
  console.log(`   NDA Signed: ${investor.ndaSigned}`);
  console.log(`   Onboarding Step: ${investor.onboardingStep}`);
  console.log(`   Lead Source: ${investor.leadSource || "unknown"}`);

  // Check structured address fields
  const hasAddress =
    investor.addressLine1 || investor.city || investor.state || investor.postalCode;
  if (hasAddress) {
    console.log(
      `   Address: ${investor.addressLine1 || ""} ${investor.addressLine2 || ""}, ${investor.city || ""}, ${investor.state || ""} ${investor.postalCode || ""}`,
    );
  } else if (investor.address) {
    console.log(`   Address (legacy): ${investor.address}`);
  } else {
    console.log("   Address: NOT SET");
  }

  // Check fundData JSON
  const fundData = investor.fundData as Record<string, unknown> | null;
  if (fundData) {
    console.log(`   Approval Stage: ${fundData.approvalStage || "unknown"}`);
    const history = fundData.approvalHistory as unknown[];
    if (Array.isArray(history)) {
      console.log(`   Approval History: ${history.length} entries`);
      for (const entry of history) {
        const e = entry as Record<string, unknown>;
        console.log(`     - ${e.stage} at ${e.timestamp}`);
      }
    }
  } else {
    console.log("   WARNING: No fundData JSON — approval stage not tracked");
  }

  if (!investor.fundId) {
    console.log("\nWARNING: Investor has no fundId — cannot proceed past commitment step");
  }

  // 2. Check Investment/Commitment
  const investments = await prisma.investment.findMany({
    where: { investorId },
    include: { tranches: true },
  });

  if (investments.length === 0) {
    console.log("\nFAIL: No Investment record found — commitment step not completed");
  } else {
    for (const inv of investments) {
      console.log(`\nOK: Investment: ${inv.id}`);
      console.log(`   Amount: $${Number(inv.commitmentAmount).toLocaleString()}`);
      console.log(`   Funded: $${Number(inv.fundedAmount).toLocaleString()}`);
      console.log(`   Status: ${inv.status}`);
      console.log(`   Staged: ${inv.isStaged}`);
      console.log(`   Subscription Date: ${inv.subscriptionDate || "NOT SET"}`);
      console.log(`   Tranches: ${inv.tranches?.length || 0}`);
      for (const t of inv.tranches || []) {
        console.log(
          `     - Tranche ${t.trancheNumber}: $${Number(t.amount).toLocaleString()} — ${t.status}`,
        );
      }
    }
  }

  // 3. Check Signature Documents (e-signature)
  if (investor.user?.email) {
    const sigRecipients = await prisma.signatureRecipient.findMany({
      where: {
        email: investor.user.email,
        role: "SIGNER",
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            status: true,
            fundId: true,
            requiredForOnboarding: true,
            completedAt: true,
          },
        },
      },
    });

    console.log(`\nSignature Documents: ${sigRecipients.length}`);
    for (const r of sigRecipients) {
      const required = r.document.requiredForOnboarding ? " [REQUIRED]" : "";
      console.log(
        `   ${r.document.title}: doc=${r.document.status}, signer=${r.status}${required}`,
      );
    }

    const requiredDocs = sigRecipients.filter(
      (r) => r.document.requiredForOnboarding,
    );
    const signedRequired = requiredDocs.filter((r) => r.status === "SIGNED");
    if (requiredDocs.length > 0) {
      console.log(
        `   Required: ${signedRequired.length}/${requiredDocs.length} signed`,
      );
      if (signedRequired.length === requiredDocs.length) {
        console.log("   OK: All required documents signed");
      } else {
        console.log("   WARNING: Not all required documents signed — DOCS_APPROVED advancement blocked");
      }
    }
  }

  // 4. Check LP Documents (manual uploads)
  const lpDocs = await prisma.lPDocument.findMany({
    where: { investorId },
  });

  console.log(`\nLP Documents (uploads): ${lpDocs.length}`);
  for (const doc of lpDocs) {
    console.log(`   ${doc.documentType}: ${doc.status} (source: ${doc.uploadSource})`);
  }

  // 5. Check Transactions (wire proofs)
  const transactions = await prisma.transaction.findMany({
    where: { investorId },
    orderBy: { initiatedAt: "desc" },
  });

  console.log(`\nTransactions: ${transactions.length}`);
  for (const tx of transactions) {
    console.log(
      `   ${tx.type}: $${Number(tx.amount).toLocaleString()} — ${tx.status}`,
    );
    if (tx.fundsReceivedDate) {
      console.log(`   Received: ${tx.fundsReceivedDate}`);
    }
    if (tx.confirmedAt) {
      console.log(`   Confirmed: ${tx.confirmedAt} by ${tx.confirmedBy}`);
    }
    const meta = tx.metadata as Record<string, unknown> | null;
    if (meta?.proofFileName) {
      console.log(`   Proof: ${meta.proofFileName} (uploaded ${meta.proofUploadedAt})`);
    }
  }

  // 6. Check OnboardingFlow
  const flows = await prisma.onboardingFlow.findMany({
    where: { investorId },
  });

  if (flows.length > 0) {
    for (const flow of flows) {
      console.log(`\nOnboardingFlow (fund ${flow.fundId}):`);
      console.log(`   Step: ${flow.currentStep}/${flow.totalSteps}`);
      console.log(`   Status: ${flow.status}`);
      console.log(`   Last Active: ${flow.lastActiveAt}`);
      console.log(`   Completed: ${flow.completedAt || "No"}`);
    }
  } else {
    console.log("\nOnboardingFlow: None (either not started or completed+deleted)");
  }

  // 7. Fund totals
  if (investor.fundId) {
    const fundTotals = await prisma.investment.aggregate({
      where: {
        fundId: investor.fundId,
        status: { notIn: ["CANCELLED", "DECLINED", "WITHDRAWN"] },
      },
      _sum: { commitmentAmount: true, fundedAmount: true },
      _count: true,
    });

    const target = investor.fund?.targetRaise
      ? Number(investor.fund.targetRaise)
      : 0;
    const committed = Number(fundTotals._sum.commitmentAmount ?? 0);
    const funded = Number(fundTotals._sum.fundedAmount ?? 0);

    console.log(`\nFund Totals (${investor.fund?.name}):`);
    console.log(`   Target: $${target.toLocaleString()}`);
    console.log(`   Committed: $${committed.toLocaleString()}`);
    console.log(`   Funded: $${funded.toLocaleString()}`);
    console.log(`   Investor Count: ${fundTotals._count}`);
    console.log(
      `   Progress: ${target > 0 ? ((committed / target) * 100).toFixed(1) : 0}% committed, ${target > 0 ? ((funded / target) * 100).toFixed(1) : 0}% funded`,
    );

    // Check FundAggregate sync (both committed and inbound/funded)
    const agg = await prisma.fundAggregate.findUnique({
      where: { fundId: investor.fundId },
    });

    if (agg) {
      const aggCommitted = Number(agg.totalCommitted ?? 0);
      const aggInbound = Number(agg.totalInbound ?? 0);
      if (Math.abs(aggCommitted - committed) > 0.01) {
        console.log(
          `   WARNING: FundAggregate.totalCommitted ($${aggCommitted.toLocaleString()}) out of sync with Investment sum ($${committed.toLocaleString()})`,
        );
      } else {
        console.log("   OK: FundAggregate.totalCommitted in sync");
      }
      if (Math.abs(aggInbound - funded) > 0.01) {
        console.log(
          `   WARNING: FundAggregate.totalInbound ($${aggInbound.toLocaleString()}) out of sync with Investment funded sum ($${funded.toLocaleString()})`,
        );
      } else {
        console.log("   OK: FundAggregate.totalInbound in sync");
      }
    } else {
      console.log("   WARNING: No FundAggregate record — totals not cached");
    }
  }

  // 8. Check Subscriptions
  const subscriptions = await prisma.subscription.findMany({
    where: { investorId },
    select: {
      id: true,
      amount: true,
      units: true,
      status: true,
      pricingTierId: true,
      createdAt: true,
    },
  });

  console.log(`\nSubscriptions: ${subscriptions.length}`);
  for (const sub of subscriptions) {
    console.log(
      `   ${sub.id}: $${Number(sub.amount).toLocaleString()} (${sub.units ?? "flat"} units) — ${sub.status}`,
    );
  }

  // 9. Check FundroomActivation (paywall)
  if (investor.fund?.teamId) {
    const activation = await prisma.fundroomActivation.findFirst({
      where: { teamId: investor.fund.teamId, status: "ACTIVE" },
    });

    if (activation) {
      console.log(`\nFundRoom Activation: ACTIVE (since ${activation.activatedAt || activation.createdAt})`);
    } else {
      console.log("\nWARNING: No active FundroomActivation — LP paid features blocked by paywall");
    }
  }

  // Flow status summary
  console.log("\n=== Flow Status Summary ===");
  const checks = [
    { label: "Investor exists", pass: true },
    { label: "Fund linked", pass: !!investor.fundId },
    { label: "NDA signed", pass: investor.ndaSigned },
    {
      label: "Accreditation",
      pass:
        investor.accreditationStatus === "SELF_CERTIFIED" ||
        investor.accreditationStatus === "KYC_VERIFIED",
    },
    { label: "Investment created", pass: investments.length > 0 },
    {
      label: "Committed",
      pass: investments.some(
        (i) => Number(i.commitmentAmount) > 0 && i.status !== "APPLIED",
      ),
    },
    {
      label: "Wire proof uploaded",
      pass: transactions.some((t) => t.type === "WIRE_TRANSFER"),
    },
    {
      label: "Wire confirmed (GP)",
      pass: transactions.some(
        (t) => t.type === "WIRE_TRANSFER" && t.status === "COMPLETED",
      ),
    },
    {
      label: "Status: FUNDED",
      pass: investments.some((i) => i.status === "FUNDED"),
    },
  ];

  for (const check of checks) {
    console.log(`  ${check.pass ? "OK" : "MISSING"}: ${check.label}`);
  }

  const completedSteps = checks.filter((c) => c.pass).length;
  console.log(`\nProgress: ${completedSteps}/${checks.length} steps complete`);
}

async function listInvestors() {
  const investors = await prisma.investor.findMany({
    include: {
      user: { select: { email: true, name: true } },
      fund: { select: { name: true } },
      investments: {
        select: { status: true, commitmentAmount: true },
        take: 1,
      },
    },
    take: 50,
    orderBy: { createdAt: "desc" },
  });

  console.log("=== FundRoom Investors ===\n");
  console.log(
    `${"ID".padEnd(28)} ${"Email".padEnd(35)} ${"Fund".padEnd(30)} ${"Step".padEnd(6)} ${"Status".padEnd(15)} Commitment`,
  );
  console.log("-".repeat(140));

  for (const i of investors) {
    const inv = i.investments[0];
    const status = inv?.status || "N/A";
    const amount = inv ? `$${Number(inv.commitmentAmount).toLocaleString()}` : "$0";
    console.log(
      `${i.id.padEnd(28)} ${(i.user?.email || "no-email").padEnd(35)} ${(i.fund?.name || "No Fund").padEnd(30)} ${String(i.onboardingStep ?? 0).padEnd(6)} ${status.padEnd(15)} ${amount}`,
    );
  }

  console.log(`\nTotal: ${investors.length} investors`);
  console.log(
    "\nUsage: npx ts-node scripts/verify-lp-flow.ts <investorId>",
  );
}

const investorId = process.argv[2];
if (!investorId) {
  listInvestors().finally(() => prisma.$disconnect());
} else {
  verifyLPFlow(investorId).finally(() => prisma.$disconnect());
}
