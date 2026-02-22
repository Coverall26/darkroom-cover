import { NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { email: auth.email },
      include: {
        teams: {
          where: { role: { in: ["ADMIN", "OWNER", "SUPER_ADMIN"] } },
          include: {
            team: {
              include: {
                funds: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const funds = user.teams.flatMap((ut) => ut.team.funds);

    return NextResponse.json({ funds });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Error fetching funds:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
