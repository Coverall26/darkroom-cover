/**
 * GP Investor Approval Pipeline for FundRoom AI
 *
 * Manages the investor approval lifecycle:
 *   APPLIED → UNDER_REVIEW → APPROVED / REJECTED → COMMITTED → FUNDED
 *
 * Each stage transition is validated and audit-logged.
 * Wire confirmation is a gate between COMMITTED and FUNDED.
 */

import prisma from "@/lib/prisma";

/** Investor approval stages */
export const INVESTOR_STAGES = [
  "APPLIED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMMITTED",
  "DOCS_APPROVED",
  "FUNDED",
] as const;

export type InvestorStage = (typeof INVESTOR_STAGES)[number];

/** Valid stage transitions */
const STAGE_TRANSITIONS: Record<string, InvestorStage[]> = {
  APPLIED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["COMMITTED", "REJECTED"],
  REJECTED: ["UNDER_REVIEW"], // Can re-open
  COMMITTED: ["DOCS_APPROVED", "FUNDED", "REJECTED"],
  DOCS_APPROVED: ["FUNDED"],
  FUNDED: [], // Terminal
};

/** Approval gate requirements */
export interface ApprovalGate {
  name: string;
  description: string;
  required: boolean;
  check: (investorId: string) => Promise<boolean>;
}

/** Stage metadata */
export interface StageInfo {
  stage: InvestorStage;
  label: string;
  description: string;
  color: string;
  nextActions: InvestorStage[];
}

export const STAGE_INFO: Record<InvestorStage, Omit<StageInfo, "nextActions">> = {
  APPLIED: {
    stage: "APPLIED",
    label: "Applied",
    description: "Investor has submitted onboarding information",
    color: "bg-blue-500",
  },
  UNDER_REVIEW: {
    stage: "UNDER_REVIEW",
    label: "Under Review",
    description: "GP is reviewing investor details and accreditation",
    color: "bg-yellow-500",
  },
  APPROVED: {
    stage: "APPROVED",
    label: "Approved",
    description: "Investor approved to invest in the fund",
    color: "bg-emerald-500",
  },
  REJECTED: {
    stage: "REJECTED",
    label: "Rejected",
    description: "Investor did not meet fund requirements",
    color: "bg-red-500",
  },
  COMMITTED: {
    stage: "COMMITTED",
    label: "Committed",
    description: "Subscription agreement signed, awaiting wire",
    color: "bg-purple-500",
  },
  DOCS_APPROVED: {
    stage: "DOCS_APPROVED",
    label: "Docs Approved",
    description: "All required documents reviewed and approved by GP",
    color: "bg-indigo-500",
  },
  FUNDED: {
    stage: "FUNDED",
    label: "Funded",
    description: "Wire confirmed, capital received",
    color: "bg-emerald-600",
  },
};

export function getStageInfo(stage: InvestorStage): StageInfo {
  return {
    ...STAGE_INFO[stage],
    nextActions: STAGE_TRANSITIONS[stage] || [],
  };
}

/**
 * Check if a stage transition is valid.
 */
export function isValidTransition(
  from: InvestorStage,
  to: InvestorStage,
): boolean {
  return (STAGE_TRANSITIONS[from] || []).includes(to);
}

/**
 * Transition an investor to a new approval stage.
 * Validates the transition and updates the investor record.
 */
export async function transitionInvestorStage(params: {
  investorId: string;
  fundId: string;
  toStage: InvestorStage;
  gpUserId: string;
  notes?: string;
  teamId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { investorId, fundId, toStage, gpUserId, notes, teamId } = params;

  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      investments: { where: { fundId } },
      manualInvestments: { where: { fundId } },
    },
  });

  if (!investor) {
    return { success: false, error: "Investor not found" };
  }

  // Determine current stage from investor data
  const currentStage = determineCurrentStage(investor);

  if (!isValidTransition(currentStage, toStage)) {
    return {
      success: false,
      error: `Cannot transition from ${currentStage} to ${toStage}`,
    };
  }

  // Check approval gates before certain transitions
  if (toStage === "APPROVED") {
    const gateResult = await checkApprovalGates(investorId);
    if (!gateResult.passed) {
      return {
        success: false,
        error: `Approval gate failed: ${gateResult.failedGate}`,
      };
    }
  }

  // Apply the stage transition
  const updateData: Record<string, unknown> = {};

  switch (toStage) {
    case "UNDER_REVIEW":
      updateData.accreditationStatus = "PENDING";
      updateData.onboardingStep = 2;
      break;
    case "APPROVED":
      updateData.accreditationStatus = "KYC_VERIFIED";
      updateData.onboardingStep = 3;
      break;
    case "REJECTED":
      updateData.accreditationStatus = "PENDING";
      break;
    case "COMMITTED":
      // Investor signed subscription, waiting for wire
      updateData.onboardingStep = 4;
      break;
    case "FUNDED":
      updateData.onboardingStep = 5;
      updateData.onboardingCompletedAt = new Date();
      break;
  }

  // Store stage and notes in fundData JSON
  const existingFundData = (investor.fundData as Record<string, unknown>) || {};
  updateData.fundData = {
    ...existingFundData,
    approvalStage: toStage,
    approvalHistory: [
      ...((existingFundData.approvalHistory as unknown[]) || []),
      {
        from: currentStage,
        to: toStage,
        by: gpUserId,
        notes: notes || null,
        at: new Date().toISOString(),
      },
    ],
  };

  await prisma.investor.update({
    where: { id: investorId },
    data: updateData as any,
  });

  return { success: true };
}

/**
 * Determine current approval stage from investor data.
 */
export function determineCurrentStage(
  investor: Record<string, unknown>,
): InvestorStage {
  // Check fundData for explicit stage
  const fundData = investor.fundData as Record<string, unknown> | null;
  if (fundData?.approvalStage) {
    return fundData.approvalStage as InvestorStage;
  }

  // Infer from investor state
  const accreditationStatus = investor.accreditationStatus as string;
  const onboardingStep = investor.onboardingStep as number;
  const onboardingCompleted = investor.onboardingCompletedAt;

  if (onboardingCompleted) return "FUNDED";
  if (accreditationStatus === "KYC_VERIFIED" && onboardingStep >= 4)
    return "COMMITTED";
  if (accreditationStatus === "KYC_VERIFIED") return "APPROVED";
  if (
    accreditationStatus === "SELF_CERTIFIED" ||
    accreditationStatus === "PENDING"
  ) {
    if (onboardingStep >= 2) return "UNDER_REVIEW";
    return "APPLIED";
  }

  return "APPLIED";
}

/**
 * Check approval gates for an investor.
 */
async function checkApprovalGates(
  investorId: string,
): Promise<{ passed: boolean; failedGate?: string }> {
  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    include: {
      accreditationAcks: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!investor) {
    return { passed: false, failedGate: "Investor not found" };
  }

  // Gate 1: Must have accreditation self-certification
  if (
    !investor.accreditationAcks.length ||
    !investor.accreditationAcks[0].acknowledged
  ) {
    return {
      passed: false,
      failedGate: "Accreditation self-certification not completed",
    };
  }

  // Gate 2: NDA must be signed
  if (!investor.ndaSigned) {
    return { passed: false, failedGate: "NDA not yet signed" };
  }

  return { passed: true };
}

/**
 * Get the investor pipeline summary for a fund.
 * Returns counts per stage.
 */
export async function getFundPipelineSummary(
  fundId: string,
): Promise<Record<InvestorStage, number>> {
  const investors = await prisma.investor.findMany({
    where: { fundId },
    select: {
      fundData: true,
      accreditationStatus: true,
      onboardingStep: true,
      onboardingCompletedAt: true,
    },
  });

  const counts: Record<InvestorStage, number> = {
    APPLIED: 0,
    UNDER_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    COMMITTED: 0,
    DOCS_APPROVED: 0,
    FUNDED: 0,
  };

  for (const investor of investors) {
    const stage = determineCurrentStage(investor as Record<string, unknown>);
    counts[stage]++;
  }

  return counts;
}

/**
 * Bulk approve investors (GP batch operation).
 */
export async function bulkApproveInvestors(params: {
  investorIds: string[];
  fundId: string;
  gpUserId: string;
  teamId: string;
}): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: { investorId: string; success: boolean; error?: string }[];
}> {
  const results = [];

  for (const investorId of params.investorIds) {
    const result = await transitionInvestorStage({
      investorId,
      fundId: params.fundId,
      toStage: "APPROVED",
      gpUserId: params.gpUserId,
      teamId: params.teamId,
    });
    results.push({ investorId, ...result });
  }

  return {
    total: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

/**
 * Mark investor as wire-confirmed (COMMITTED → FUNDED transition).
 * This is the final approval gate in the manual wire MVP.
 */
export async function confirmWireReceived(params: {
  investorId: string;
  fundId: string;
  gpUserId: string;
  teamId: string;
  wireRef?: string;
  amount?: number;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { investorId, fundId, gpUserId, teamId, wireRef, amount, notes } =
    params;

  // First, transition to FUNDED
  const transitionResult = await transitionInvestorStage({
    investorId,
    fundId,
    toStage: "FUNDED",
    gpUserId,
    teamId,
    notes: notes || `Wire confirmed${wireRef ? ` (ref: ${wireRef})` : ""}`,
  });

  if (!transitionResult.success) {
    return transitionResult;
  }

  // Update manual investments if they exist
  const manualInvestments = await prisma.manualInvestment.findMany({
    where: { investorId, fundId, proofStatus: { in: ["RECEIVED", "PENDING"] } },
  });

  for (const investment of manualInvestments) {
    await prisma.manualInvestment.update({
      where: { id: investment.id },
      data: {
        proofStatus: "VERIFIED",
        proofVerifiedBy: gpUserId,
        proofVerifiedAt: new Date(),
        transferStatus: "COMPLETED",
        transferRef: wireRef || investment.transferRef,
        isVerified: true,
        verifiedBy: gpUserId,
        verifiedAt: new Date(),
        fundedAmount: amount
          ? amount
          : investment.commitmentAmount,
        fundedDate: new Date(),
      } as any,
    });
  }

  return { success: true };
}
