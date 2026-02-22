/**
 * Audit Log Verification API Endpoint
 * 
 * Verifies the integrity of the immutable audit log chain for a team.
 * Uses SHA-256 hash chaining to detect any tampering or corruption.
 * 
 * ## Endpoint Details
 * - **Method**: GET
 * - **Path**: `/api/teams/:teamId/audit/verify`
 * - **Auth**: Required (session-based)
 * - **Role**: OWNER, ADMIN, or SUPER_ADMIN only
 * 
 * ## Response Format
 * ```json
 * {
 *   "verification": {
 *     "isValid": true,
 *     "totalEntries": 150,
 *     "verifiedEntries": 150,
 *     "errors": []
 *   },
 *   "integrity": {
 *     "chainLength": 150,
 *     "firstEntry": "2024-01-01T00:00:00.000Z",
 *     "lastEntry": "2024-12-31T23:59:59.999Z",
 *     "lastHash": "abc123..."
 *   },
 *   "verifiedAt": "2024-12-31T23:59:59.999Z"
 * }
 * ```
 * 
 * ## Security
 * - Only team admins can verify audit logs
 * - Verification is a read-only operation
 * - Does not modify the audit chain
 * 
 * @see lib/audit/immutable-audit-log - Verification logic
 */

import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { verifyAuditChain, getAuditLogIntegrity } from "@/lib/audit/immutable-audit-log";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { teamId } = req.query;
  if (!teamId || typeof teamId !== "string") {
    return res.status(400).json({ error: "Team ID is required" });
  }

  const userId = (session.user as CustomUser).id;
  const teamMembership = await prisma.userTeam.findUnique({
    where: {
      userId_teamId: {
        userId,
        teamId,
      },
    },
    select: {
      role: true,
    },
  });

  if (!teamMembership) {
    return res.status(403).json({ error: "Access denied. You are not a member of this team." });
  }

  if (!["OWNER", "ADMIN", "SUPER_ADMIN"].includes(teamMembership.role)) {
    return res.status(403).json({ error: "Access denied. Admin role required to view audit logs." });
  }

  try {
    const [verification, integrity] = await Promise.all([
      verifyAuditChain(teamId),
      getAuditLogIntegrity(teamId),
    ]);

    return res.status(200).json({
      verification,
      integrity,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Audit verification error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
