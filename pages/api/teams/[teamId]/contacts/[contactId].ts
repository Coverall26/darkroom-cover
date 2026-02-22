import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import {
  getContact,
  updateContact,
  deleteContact,
  type ContactUpdateInput,
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

  // Verify team membership with admin role
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

  switch (req.method) {
    case "GET":
      return handleGet(res, contactId, teamId);
    case "PATCH":
      return handleUpdate(req, res, contactId, teamId, userId);
    case "DELETE":
      return handleDelete(res, contactId, teamId, userId);
    default:
      res.setHeader("Allow", ["GET", "PATCH", "DELETE"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

async function handleGet(
  res: NextApiResponse,
  contactId: string,
  teamId: string,
) {
  try {
    const contact = await getContact(contactId, teamId);
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    return res.status(200).json(contact);
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching contact:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handleUpdate(
  req: NextApiRequest,
  res: NextApiResponse,
  contactId: string,
  teamId: string,
  userId: string,
) {
  try {
    const {
      firstName,
      lastName,
      phone,
      company,
      title,
      status,
      assignedToId,
      tags,
      customFields,
      referralSource,
      notes,
    } = req.body;

    const input: ContactUpdateInput = {};
    if (firstName !== undefined) input.firstName = firstName;
    if (lastName !== undefined) input.lastName = lastName;
    if (phone !== undefined) input.phone = phone;
    if (company !== undefined) input.company = company;
    if (title !== undefined) input.title = title;
    if (status !== undefined) input.status = status;
    if (assignedToId !== undefined) input.assignedToId = assignedToId;
    if (tags !== undefined) input.tags = tags;
    if (customFields !== undefined) input.customFields = customFields;
    if (referralSource !== undefined) input.referralSource = referralSource;
    if (notes !== undefined) input.notes = notes;

    const updated = await updateContact(contactId, teamId, input);
    if (!updated) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // Log status change if applicable
    if (status) {
      await logContactActivity({
        contactId,
        type: "STATUS_CHANGE",
        actorId: userId,
        description: `Status changed to ${status}`,
        metadata: { newStatus: status },
      }).catch((e) => reportError(e as Error));
    }

    // Log assignment change
    if (assignedToId !== undefined) {
      await logContactActivity({
        contactId,
        type: "ASSIGNED",
        actorId: userId,
        description: assignedToId
          ? `Contact assigned to team member`
          : `Contact unassigned`,
      }).catch((e) => reportError(e as Error));
    }

    return res.status(200).json(updated);
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating contact:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handleDelete(
  res: NextApiResponse,
  contactId: string,
  teamId: string,
  userId: string,
) {
  try {
    const deleted = await deleteContact(contactId, teamId);
    if (!deleted) {
      return res.status(404).json({ error: "Contact not found" });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    reportError(error as Error);
    console.error("Error deleting contact:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
