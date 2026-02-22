/**
 * Team Settings API Endpoint
 * 
 * Retrieves team-specific settings including security and feature flags.
 * These settings control behavior across the application for a specific team.
 * 
 * ## Endpoint Details
 * - **Method**: GET
 * - **Path**: `/api/teams/:teamId/settings`
 * - **Auth**: Required (session-based)
 * - **Access**: Team members only
 * 
 * ## Response Format
 * ```json
 * {
 *   "replicateDataroomFolders": true,
 *   "enableExcelAdvancedMode": false,
 *   "enableClientSideEncryption": true,
 *   "requireEncryptionForSensitive": false
 * }
 * ```
 * 
 * ## Available Settings
 * - `replicateDataroomFolders`: Mirror dataroom folders in main documents
 * - `enableExcelAdvancedMode`: Enable advanced Excel viewing features
 * - `enableClientSideEncryption`: Enable client-side file encryption before upload
 * - `requireEncryptionForSensitive`: Require encryption for sensitive documents
 * 
 * ## Security Settings
 * The encryption settings control whether files are encrypted in the browser
 * before upload. When enabled:
 * - Files are encrypted using AES-256-GCM
 * - Encryption keys are stored only on the client
 * - Server receives only encrypted data
 * 
 * @see lib/swr/use-team-settings - Client-side hook
 * @see lib/files/encrypt-file - Encryption implementation
 */

import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

import { authOptions } from "@/lib/auth/auth-options";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    // GET /api/teams/:teamId/settings
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).end("Unauthorized");
    }

    const { teamId } = req.query as { teamId: string };
    const userId = (session.user as CustomUser).id;

    try {
      // Verify user has access to the team
      const teamAccess = await prisma.userTeam.findUnique({
        where: {
          userId_teamId: {
            userId: userId,
            teamId: teamId,
          },
        },
        select: { teamId: true },
      });

      if (!teamAccess) {
        return res.status(401).end("Unauthorized");
      }

      // Fetch only the settings fields
      const teamSettings = await prisma.team.findUnique({
        where: {
          id: teamId,
        },
        select: {
          replicateDataroomFolders: true,
          enableExcelAdvancedMode: true,
          enableClientSideEncryption: true,
          requireEncryptionForSensitive: true,
        },
      });

      if (!teamSettings) {
        return res.status(404).json({ error: "Team not found" });
      }

      return res.status(200).json(teamSettings);
    } catch (error) {
      errorhandler(error, res);
    }
  } else {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
