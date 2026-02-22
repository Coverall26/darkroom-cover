import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  createDealNote,
  listDealNotes,
  updateDealNote,
  deleteDealNote,
} from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; dealId: string }>;
};

/**
 * GET /api/teams/[teamId]/marketplace/deals/[dealId]/notes
 * List notes for a deal (GP view — includes private notes).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    // GP users can see private notes
    const notes = await listDealNotes(dealId, true);
    return NextResponse.json({ notes });
  } catch (error: unknown) {
    console.error("List notes error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/marketplace/deals/[dealId]/notes
 * Create a note on a deal.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.content) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    const note = await createDealNote(
      dealId,
      {
        content: body.content,
        isPrivate: body.isPrivate,
        pinned: body.pinned,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, note }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create note error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/marketplace/deals/[dealId]/notes
 * Update a note.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.noteId) {
      return NextResponse.json(
        { error: "noteId is required" },
        { status: 400 },
      );
    }

    const note = await updateDealNote(
      body.noteId,
      {
        content: body.content,
        isPrivate: body.isPrivate,
        pinned: body.pinned,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, note });
  } catch (error: unknown) {
    console.error("Update note error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[teamId]/marketplace/deals/[dealId]/notes
 * Delete a note.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const noteId = url.searchParams.get("noteId");

    if (!noteId) {
      return NextResponse.json(
        { error: "noteId query parameter is required" },
        { status: 400 },
      );
    }

    const note = await deleteDealNote(noteId, auth.userId);
    return NextResponse.json({ success: true, note });
  } catch (error: unknown) {
    console.error("Delete note error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
