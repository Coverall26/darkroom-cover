import { NextApiRequest, NextApiResponse } from "next";
import { withTeamAuthPages } from "@/lib/auth/with-team-auth-pages";
import {
  transitionInvestorStage,
  determineCurrentStage,
  getStageInfo,
  isValidTransition,
  confirmWireReceived,
} from "@/lib/investor";
import type { InvestorStage } from "@/lib/investor";
import prisma from "@/lib/prisma";
import { sendInvestorApprovedEmail } from "@/lib/emails/send-investor-approved";

/**
 * POST /api/teams/[teamId]/investors/[investorId]/stage
 *
 * Transition an investor to a new approval stage.
 * GP-only endpoint (ADMIN or higher role required).
 *
 * Body: { stage: InvestorStage, fundId: string, notes?: string, wireRef?: string, amount?: number }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const teamId = req.query.teamId as string;
  const auth = await withTeamAuthPages(req, res, teamId);
  if (!auth) return;

  const investorId = req.query.investorId as string;

  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    select: {
      id: true,
      fundData: true,
      accreditationStatus: true,
      onboardingStep: true,
      onboardingCompletedAt: true,
    },
  });

  if (!investor) {
    return res.status(404).json({ error: "Investor not found" });
  }

  const currentStage = determineCurrentStage(
    investor as Record<string, unknown>,
  );
  const info = getStageInfo(currentStage);
  const history =
    (investor.fundData as Record<string, unknown>)?.approvalHistory || [];

  return res.status(200).json({
    currentStage,
    stageInfo: info,
    history,
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const teamId = req.query.teamId as string;
  const auth = await withTeamAuthPages(req, res, teamId, { minRole: "ADMIN" });
  if (!auth) return;

  const investorId = req.query.investorId as string;
  const { stage, fundId, notes, wireRef, amount } = req.body;

  if (!stage || !fundId) {
    return res.status(400).json({ error: "stage and fundId are required" });
  }

  // Validate that the stage is a known value
  const validStages: InvestorStage[] = [
    "APPLIED",
    "UNDER_REVIEW",
    "APPROVED",
    "REJECTED",
    "COMMITTED",
    "FUNDED",
  ];
  if (!validStages.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage: ${stage}` });
  }

  // Special handling for wire confirmation (COMMITTED → FUNDED)
  if (stage === "FUNDED") {
    const result = await confirmWireReceived({
      investorId,
      fundId,
      gpUserId: auth.userId,
      teamId,
      wireRef,
      amount,
      notes,
    });

    if (!result.success) {
      return res.status(400).json({ error: "Invalid stage transition" });
    }

    return res.status(200).json({ success: true, stage: "FUNDED" });
  }

  const result = await transitionInvestorStage({
    investorId,
    fundId,
    toStage: stage as InvestorStage,
    gpUserId: auth.userId,
    teamId,
    notes,
  });

  if (!result.success) {
    return res.status(400).json({ error: "Invalid stage transition" });
  }

  // Fire-and-forget email on APPROVED transition
  if (stage === "APPROVED") {
    sendInvestorApprovedEmail(investorId, fundId);
  }

  return res.status(200).json({ success: true, stage });
}
