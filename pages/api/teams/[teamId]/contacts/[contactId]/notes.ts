import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import {
  createContactNote,
  getContactNotes,
  getContact,
} from "@/lib/crm";
import { logContactActivity } from "@/lib/crm/contact-service";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { apiRateLimiter } from "@/lib/security/rate-limiter";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const allowed = await apiRateLimiter(req, res);
  if (!allowed) return;

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = (session.user as CustomUser).id;
  const { teamId, contactId } = req.query as {
    teamId: string;
    contactId: string;
  };

  // Verify team membership
  const membership = await prisma.userTeam.findFirst({
    where: {
      teamId,
      userId,
      role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"] },
      status: "ACTIVE",
    },
    select: { role: true },
  });

  if (!membership) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Verify contact belongs to team
  const contact = await getContact(contactId, teamId);
  if (!contact) {
    return res.status(404).json({ error: "Contact not found" });
  }

  if (req.method === "GET") {
    try {
      const isAdmin = ["OWNER", "SUPER_ADMIN", "ADMIN"].includes(
        membership.role,
      );
      const notes = await getContactNotes(contactId, isAdmin, userId);
      return res.status(200).json(notes);
    } catch (error) {
      reportError(error as Error);
      console.error("Error fetching contact notes:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else if (req.method === "POST") {
    try {
      const { content, isPinned, isPrivate } = req.body;

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "Note content is required" });
      }

      if (content.length > 10000) {
        return res.status(400).json({ error: "Note content too long (max 10,000 characters)" });
      }

      const note = await createContactNote({
        contactId,
        authorId: userId,
        content: content.trim(),
        isPinned: isPinned === true,
        isPrivate: isPrivate === true,
      });

      // Log activity
      await logContactActivity({
        contactId,
        type: "NOTE_ADDED",
        actorId: userId,
        description: `Note added`,
      }).catch((e) => reportError(e as Error));

      return res.status(201).json(note);
    } catch (error) {
      reportError(error as Error);
      console.error("Error creating contact note:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
