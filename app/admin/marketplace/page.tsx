import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import MarketplaceDashboardClient from "./page-client";

export const metadata: Metadata = {
  title: "Deal Pipeline | GP Admin",
  description: "Manage your deal pipeline and marketplace listings",
};

export default async function MarketplaceDashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const user = session.user as CustomUser;

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      role: { in: ["ADMIN", "OWNER"] },
    },
    include: {
      team: {
        select: { id: true, name: true },
      },
    },
  });

  if (!userTeam) {
    redirect("/dashboard");
  }

  return (
    <MarketplaceDashboardClient
      teamId={userTeam.teamId}
      teamName={userTeam.team.name}
    />
  );
}
