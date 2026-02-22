import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { CustomUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/entities/[id]
 *
 * Get a single entity by ID with associated investors.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;

  const userTeam = await prisma.userTeam.findFirst({
    where: { userId: user.id },
    include: { team: true },
  });

  if (!userTeam || !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(userTeam.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entity = await prisma.entity.findFirst({
    where: { id, teamId: userTeam.teamId },
    include: {
      investors: {
        include: {
          investor: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  return NextResponse.json(entity);
}

/**
 * PATCH /api/admin/entities/[id]
 *
 * Update an entity by ID.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;

  const userTeam = await prisma.userTeam.findFirst({
    where: { userId: user.id },
    include: { team: true },
  });

  if (!userTeam || !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(userTeam.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entity = await prisma.entity.findFirst({
    where: { id, teamId: userTeam.teamId },
  });

  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const { name, description, mode, fundConfig, startupConfig } = await req.json();

  const updated = await prisma.entity.updateMany({
    where: { id, teamId: userTeam.teamId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(mode !== undefined && { mode }),
      ...(fundConfig !== undefined && { fundConfig }),
      ...(startupConfig !== undefined && { startupConfig }),
    },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const result = await prisma.entity.findFirst({
    where: { id, teamId: userTeam.teamId },
  });
  return NextResponse.json(result);
}

/**
 * DELETE /api/admin/entities/[id]
 *
 * Delete an entity by ID.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;

  const userTeam = await prisma.userTeam.findFirst({
    where: { userId: user.id },
    include: { team: true },
  });

  if (!userTeam || !["OWNER", "ADMIN", "SUPER_ADMIN"].includes(userTeam.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted = await prisma.entity.deleteMany({
    where: { id, teamId: userTeam.teamId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
