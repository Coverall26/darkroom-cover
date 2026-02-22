/**
 * PUT /api/contacts/[id]/follow-up — Set or clear next follow-up date.
 * Body: { nextFollowUpAt: string | null }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveCrmRole } from "@/lib/auth/crm-roles";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: { role: true, crmRole: true, team: { select: { id: true } } },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // CRM role check: CONTRIBUTOR+ required
    const effectiveRole = resolveCrmRole(userTeam.role || "MEMBER", userTeam.crmRole);
    if (effectiveRole === "VIEWER") {
      return NextResponse.json(
        { error: "Forbidden: CRM CONTRIBUTOR role required" },
        { status: 403 },
      );
    }

    const contact = await prisma.contact.findFirst({
      where: { id, teamId: userTeam.team.id },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const body = await req.json();
    const { nextFollowUpAt } = body;

    // Validate date if provided
    let parsedDate: Date | null = null;
    if (nextFollowUpAt !== null && nextFollowUpAt !== undefined) {
      parsedDate = new Date(nextFollowUpAt);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: { nextFollowUpAt: parsedDate },
    });

    return NextResponse.json({ id: updated.id, nextFollowUpAt: updated.nextFollowUpAt });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
