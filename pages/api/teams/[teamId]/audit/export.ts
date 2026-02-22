/**
 * Audit Log Export API Endpoint
 * 
 * Exports audit logs for a specified date range with integrity checksums
 * for regulatory compliance (SEC, FINRA, etc.).
 * 
 * ## Endpoint Details
 * - **Method**: POST
 * - **Path**: `/api/teams/:teamId/audit/export`
 * - **Auth**: Required (session-based)
 * - **Role**: OWNER, ADMIN, or SUPER_ADMIN only
 * 
 * ## Request Body
 * ```json
 * {
 *   "fromDate": "2024-01-01",
 *   "toDate": "2024-12-31"
 * }
 * ```
 * 
 * ## Response Format
 * ```json
 * {
 *   "entries": [...],
 *   "exportMetadata": {
 *     "exportedAt": "2024-12-31T23:59:59.999Z",
 *     "checksum": "sha256-abc123...",
 *     "recordCount": 150,
 *     "dateRange": { "from": "...", "to": "..." }
 *   }
 * }
 * ```
 * 
 * ## Compliance Features
 * - Export is logged as AUDIT_LOG_EXPORT event
 * - Checksum included for integrity verification
 * - Suitable for regulatory audits (7-year retention)
 * - Each export creates an immutable record
 * 
 * ## Security
 * - Only team admins can export audit logs
 * - Export action is itself logged
 * - Checksums prevent post-export tampering
 * 
 * @see lib/audit/immutable-audit-log - Export logic
 */

import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { exportAuditLogForCompliance, createImmutableAuditEntry } from "@/lib/audit/immutable-audit-log";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
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
    return res.status(403).json({ error: "Access denied. Admin role required to export audit logs." });
  }

  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) {
    return res.status(400).json({ error: "Date range is required" });
  }

  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);

    const exportData = await exportAuditLogForCompliance(teamId, from, to);

    await createImmutableAuditEntry({
      eventType: "AUDIT_LOG_EXPORT",
      userId,
      teamId,
      resourceType: "AuditLog",
      metadata: {
        dateRange: { from: fromDate, to: toDate },
        recordCount: exportData.entries.length,
        checksum: exportData.exportMetadata.checksum,
      },
    });

    return res.status(200).json(exportData);
  } catch (error) {
    reportError(error as Error);
    console.error("Audit export error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
