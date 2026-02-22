import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { getContact } from "@/lib/crm";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { apiRateLimiter } from "@/lib/security/rate-limiter";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

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

  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize as string, 10) || 25),
    );
    const skip = (page - 1) * pageSize;

    const [activities, total] = await Promise.all([
      prisma.contactActivity.findMany({
        where: { contactId },
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.contactActivity.count({ where: { contactId } }),
    ]);

    return res.status(200).json({
      activities,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching contact activities:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
