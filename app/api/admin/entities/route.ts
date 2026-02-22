import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/entities
 *
 * List entities for the authenticated user's team.
 */
export async function GET() {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const teamId = auth.teamId;

  const entities = await prisma.entity.findMany({
    where: { teamId },
    include: {
      _count: { select: { investors: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(entities);
}

/**
 * POST /api/admin/entities
 *
 * Create a new entity for the authenticated user's team.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const teamId = auth.teamId;

  const { name, description, mode } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const entity = await prisma.entity.create({
    data: {
      teamId,
      name,
      description,
      mode: mode || "FUND",
      fundConfig: mode === "FUND" ? {} : undefined,
      startupConfig: mode === "STARTUP" ? {} : undefined,
    },
  });

  return NextResponse.json(entity, { status: 201 });
}
