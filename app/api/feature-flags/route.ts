import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { getFeatureFlags } from "@/lib/featureFlags";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId");

    // If teamId is provided, verify user belongs to that team
    if (teamId) {
      const membership = await prisma.userTeam.findFirst({
        where: {
          userId: session.user.id,
          teamId,
        },
      });

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const features = await getFeatureFlags({ teamId: teamId || undefined });
    return NextResponse.json(features);
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching feature flags:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
