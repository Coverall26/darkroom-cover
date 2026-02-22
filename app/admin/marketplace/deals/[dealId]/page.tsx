import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import DealDetailClient from "./page-client";

export const metadata: Metadata = {
  title: "Deal Details | GP Admin",
  description: "View and manage deal details",
};

interface DealDetailPageProps {
  params: Promise<{ dealId: string }>;
}

export default async function DealDetailPage({ params }: DealDetailPageProps) {
  const session = await getServerSession(authOptions);
  const { dealId } = await params;

  if (!session) {
    redirect("/login");
  }

  const user = session.user as CustomUser;

  // Find user's team membership
  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      role: { in: ["ADMIN", "OWNER"] },
    },
    select: { teamId: true },
  });

  if (!userTeam) {
    redirect("/dashboard");
  }

  return (
    <DealDetailClient
      dealId={dealId}
      teamId={userTeam.teamId}
    />
  );
}
