import { NextApiRequest, NextApiResponse } from "next";
import { withTeamAuthPages } from "@/lib/auth/with-team-auth-pages";
import { getFundPipelineSummary, STAGE_INFO } from "@/lib/investor";

/**
 * GET /api/teams/[teamId]/investors/pipeline?fundId=xxx
 *
 * Returns the investor approval pipeline summary for a fund.
 * Shows count of investors at each stage.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const teamId = req.query.teamId as string;
  const auth = await withTeamAuthPages(req, res, teamId);
  if (!auth) return;

  const fundId = req.query.fundId as string;
  if (!fundId) {
    return res.status(400).json({ error: "fundId query parameter is required" });
  }

  const counts = await getFundPipelineSummary(fundId);

  // Combine with stage metadata for the frontend
  const pipeline = Object.entries(counts).map(([stage, count]) => ({
    ...STAGE_INFO[stage as keyof typeof STAGE_INFO],
    count,
  }));

  const totalInvestors = Object.values(counts).reduce((a, b) => a + b, 0);

  return res.status(200).json({
    fundId,
    totalInvestors,
    pipeline,
    counts,
  });
}
