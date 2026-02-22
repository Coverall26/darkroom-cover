/**
 * Team Encryption Settings Update API
 * 
 * Updates client-side encryption settings for a team.
 * 
 * ## Endpoint Details
 * - **Method**: PATCH
 * - **Path**: `/api/teams/:teamId/update-encryption-settings`
 * - **Auth**: Required (session-based)
 * - **Access**: Team members with admin/owner role
 * 
 * ## Request Body
 * ```json
 * {
 *   "enableClientSideEncryption": true,
 *   "requireEncryptionForSensitive": false
 * }
 * ```
 * 
 * ## Response
 * - **200**: Settings updated successfully
 * - **401**: Unauthorized
 * - **403**: Insufficient permissions
 * - **404**: Team not found
 * 
 * @see lib/files/encrypt-file.ts - Client-side encryption implementation
 * @see components/upload-zone.tsx - Upload component using encryption
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
  if (req.method === "PATCH") {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).end("Unauthorized");
    }

    const { teamId } = req.query as { teamId: string };
    const { enableClientSideEncryption, requireEncryptionForSensitive } = req.body;

    try {
      const userId = (session.user as CustomUser).id;
      
      const userTeam = await prisma.userTeam.findUnique({
        where: {
          userId_teamId: {
            userId,
            teamId,
          },
        },
        select: {
          role: true,
          team: {
            select: {
              id: true,
              plan: true,
            },
          },
        },
      });

      if (!userTeam) {
        return res.status(404).json({ error: "Team not found." });
      }

      if (!["OWNER", "ADMIN"].includes(userTeam.role)) {
        return res.status(403).json({ 
          error: "Only team owners and admins can change encryption settings." 
        });
      }

      const updateData: Record<string, boolean> = {};
      
      if (typeof enableClientSideEncryption === "boolean") {
        updateData.enableClientSideEncryption = enableClientSideEncryption;
      }
      
      if (typeof requireEncryptionForSensitive === "boolean") {
        updateData.requireEncryptionForSensitive = requireEncryptionForSensitive;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid settings provided." });
      }

      await prisma.team.update({
        where: {
          id: teamId,
        },
        data: updateData,
      });

      return res.status(200).json({ 
        message: "Encryption settings updated!",
        settings: updateData 
      });
    } catch (error) {
      errorhandler(error, res);
    }
  } else {
    res.setHeader("Allow", ["PATCH"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
