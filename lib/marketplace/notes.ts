import prisma from "@/lib/prisma";

// ============================================================================
// Note Types
// ============================================================================

export interface CreateNoteInput {
  content: string;
  isPrivate?: boolean;
  pinned?: boolean;
}

export interface UpdateNoteInput {
  content?: string;
  isPrivate?: boolean;
  pinned?: boolean;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new note on a deal.
 */
export async function createDealNote(
  dealId: string,
  input: CreateNoteInput,
  userId: string,
) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, title: true },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  const note = await prisma.dealNote.create({
    data: {
      dealId,
      content: input.content,
      isPrivate: input.isPrivate ?? true,
      pinned: input.pinned ?? false,
      authorId: userId,
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId,
      activityType: "NOTE_ADDED",
      title: "Note added to deal",
      metadata: {
        noteId: note.id,
        isPrivate: note.isPrivate,
        pinned: note.pinned,
      },
      userId,
    },
  });

  return note;
}

/**
 * List notes for a deal, optionally including private notes.
 */
export async function listDealNotes(
  dealId: string,
  includePrivate?: boolean,
) {
  return prisma.dealNote.findMany({
    where: {
      dealId,
      ...(includePrivate ? {} : { isPrivate: false }),
    },
    include: {
      author: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update an existing note.
 */
export async function updateDealNote(
  noteId: string,
  input: UpdateNoteInput,
  userId: string,
) {
  const existing = await prisma.dealNote.findUnique({
    where: { id: noteId },
    select: { id: true, dealId: true, authorId: true },
  });

  if (!existing) {
    throw new Error(`Note not found: ${noteId}`);
  }

  const data: { content?: string; isPrivate?: boolean; pinned?: boolean } = {};

  if (input.content !== undefined) data.content = input.content;
  if (input.isPrivate !== undefined) data.isPrivate = input.isPrivate;
  if (input.pinned !== undefined) data.pinned = input.pinned;

  const note = await prisma.dealNote.update({
    where: { id: noteId },
    data,
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  return note;
}

/**
 * Delete a note from a deal.
 */
export async function deleteDealNote(noteId: string, userId: string) {
  const existing = await prisma.dealNote.findUnique({
    where: { id: noteId },
    select: { id: true, dealId: true, authorId: true },
  });

  if (!existing) {
    throw new Error(`Note not found: ${noteId}`);
  }

  const note = await prisma.dealNote.delete({
    where: { id: noteId },
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId: existing.dealId,
      activityType: "NOTE_DELETED",
      title: "Note removed from deal",
      metadata: {
        noteId: existing.id,
      },
      userId,
    },
  });

  return note;
}
