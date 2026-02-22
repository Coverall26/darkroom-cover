import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import {
  createContact,
  searchContacts,
  type ContactCreateInput,
  type ContactSearchParams,
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
  // Rate limit
  const allowed = await apiRateLimiter(req, res);
  if (!allowed) return;

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = (session.user as CustomUser).id;
  const { teamId } = req.query as { teamId: string };

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

  if (req.method === "GET") {
    return handleSearch(req, res, teamId);
  } else if (req.method === "POST") {
    return handleCreate(req, res, teamId, userId);
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

async function handleSearch(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
) {
  try {
    const {
      query,
      status,
      source,
      assignedToId,
      hasInvestor,
      minEngagementScore,
      tags,
      page,
      pageSize,
      sortBy,
      sortOrder,
    } = req.query;

    const params: ContactSearchParams = {
      teamId,
      query: query as string | undefined,
      status: status as ContactSearchParams["status"],
      source: source as ContactSearchParams["source"],
      assignedToId: assignedToId as string | undefined,
      hasInvestor:
        hasInvestor === "true" ? true : hasInvestor === "false" ? false : undefined,
      minEngagementScore: minEngagementScore
        ? parseInt(minEngagementScore as string, 10)
        : undefined,
      tags: tags ? (Array.isArray(tags) ? tags as string[] : [tags as string]) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
      sortBy: sortBy as ContactSearchParams["sortBy"],
      sortOrder: sortOrder as ContactSearchParams["sortOrder"],
    };

    const result = await searchContacts(params);
    return res.status(200).json(result);
  } catch (error) {
    reportError(error as Error);
    console.error("Error searching contacts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  userId: string,
) {
  try {
    const { email, firstName, lastName, phone, company, title, status, source, investorId, assignedToId, tags, customFields, referralSource, notes } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const input: ContactCreateInput = {
      teamId,
      email,
      firstName,
      lastName,
      phone,
      company,
      title,
      status,
      source,
      investorId,
      assignedToId,
      tags,
      customFields,
      referralSource,
      notes,
    };

    const contact = await createContact(input);

    // Log activity
    await logContactActivity({
      contactId: contact.id,
      type: "CREATED",
      actorId: userId,
      description: `Contact created manually`,
    }).catch((e) => reportError(e as Error));

    return res.status(201).json(contact);
  } catch (error) {
    // Handle unique constraint violation (duplicate email in team)
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return res
        .status(409)
        .json({ error: "A contact with this email already exists in this team" });
    }

    reportError(error as Error);
    console.error("Error creating contact:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
