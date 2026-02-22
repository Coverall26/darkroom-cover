import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";

import { identifyUser, trackAnalytics } from "@/lib/analytics";
import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    // GET /api/teams/:teamId/invitations/accept?token=...&email=...
    const session = await getServerSession(req, res, authOptions);

    const { teamId, token, email } = req.query as {
      teamId: string;
      token?: string;
      email?: string;
    };

    // Check if user is authenticated
    if (!session) {
      // Store the invitation details in the redirect URL
      const redirectUrl = `/login?next=/api/teams/${teamId}/invitations/accept`;
      const params = new URLSearchParams();

      if (token) params.append("token", token);
      if (email) params.append("email", email);

      const finalRedirectUrl = params.toString()
        ? `${redirectUrl}&${params.toString()}`
        : redirectUrl;

      res.redirect(finalRedirectUrl);
      return;
    }

    const userId = (session.user as CustomUser).id;
    const userEmail = (session.user as CustomUser).email;

    try {
      // Check if user is already in the team
      const userTeam = await prisma.userTeam.findFirst({
        where: {
          teamId,
          userId,
        },
      });

      if (userTeam) {
        return res.redirect(`/documents?invitation=teamMember`);
      }

      // Find the invitation
      let invitation;
      if (token && email) {
        // First try to find by token and email
        invitation = await prisma.invitation.findFirst({
          where: {
            token,
            email,
            teamId,
          },
        });

        if (!invitation) {
          // Invitation not found with token and email, will try user email
        }
      }

      // If not found by token/email or if token/email not provided, try by user email
      if (!invitation && userEmail) {
        invitation = await prisma.invitation.findUnique({
          where: {
            email_teamId: {
              email: userEmail,
              teamId,
            },
          },
        });

        if (!invitation) {
          // Invitation not found with user email either
        }
      }

      if (!invitation) {
        return res.status(404).json("Invalid invitation");
      }

      if (invitation.email !== (session?.user as CustomUser).email) {
        return res.status(403).json("You are not invited to this team");
      }

      const currentTime = new Date();
      if (currentTime > invitation.expires) {
        return res.status(410).json("Invitation link has expired");
      }

      await prisma.team.update({
        where: {
          id: teamId,
        },
        data: {
          users: {
            create: {
              userId,
            },
          },
        },
      });

      await identifyUser(invitation.email);
      await trackAnalytics({
        event: "Team Member Invitation Accepted",
        teamId: teamId,
      });

      // Track LP invitation accepted (fire-and-forget — no await on critical path)
      publishServerEvent("funnel_invitation_accepted", {
        userId,
        teamId,
      });

      // delete the invitation record after user is successfully added to the team
      await prisma.invitation.delete({
        where: {
          token: invitation.token,
        },
      });

      return res.redirect(`/documents?invitation=accepted`);
    } catch (error) {
      errorhandler(error, res);
    }
  }
}
