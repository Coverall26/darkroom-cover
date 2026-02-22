/**
 * GET/POST /api/contacts/[id]/notes — Contact notes CRUD.
 * Scoped to user's team. Creates activity on note creation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — List notes for a contact
// ---------------------------------------------------------------------------

export async function GET(
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
      select: { team: { select: { id: true } } },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // Verify contact belongs to user's team
    const contact = await prisma.contact.findFirst({
      where: { id, teamId: userTeam.team.id },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const notes = await prisma.contactNote.findMany({
      where: { contactId: id },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    return NextResponse.json({ notes });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — Create a note
// ---------------------------------------------------------------------------

export async function POST(
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
    const body = await req.json();
    const { content, isPinned, isPrivate } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Note content is required" }, { status: 400 });
    }

    if (content.length > 10_000) {
      return NextResponse.json({ error: "Note content too long (max 10,000 chars)" }, { status: 400 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: { team: { select: { id: true } } },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const contact = await prisma.contact.findFirst({
      where: { id, teamId: userTeam.team.id },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const [note] = await prisma.$transaction([
      prisma.contactNote.create({
        data: {
          contactId: id,
          authorId: session.user.id,
          content: content.trim(),
          isPinned: isPinned === true,
          isPrivate: isPrivate === true,
        },
        include: {
          author: { select: { id: true, name: true, email: true, image: true } },
        },
      }),
      prisma.contactActivity.create({
        data: {
          contactId: id,
          type: "NOTE_ADDED",
          actorId: session.user.id,
          description: `Note added${isPinned ? " (pinned)" : ""}`,
        },
      }),
    ]);

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
