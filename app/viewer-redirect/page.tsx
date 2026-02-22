import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { constructLinkUrl } from "@/lib/utils/link-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Redirecting | FundRoom",
  description: "Redirecting to your dataroom",
};

export default async function ViewerRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  let resolvedSearchParams: { mode?: string };
  try {
    resolvedSearchParams = await searchParams;
  } catch {
    resolvedSearchParams = {};
  }

  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (error) {
    console.error("[viewer-redirect] Session error:", error);
    redirect("/login");
  }

  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = session.user as CustomUser;
  const userEmail = user.email!.toLowerCase();
  const userRole = user.role || "LP";

  const visitorMode = resolvedSearchParams.mode === "visitor";

  try {
    if (!visitorMode) {
      if (userRole === "GP") {
        const userTeam = await prisma.userTeam.findFirst({
          where: { userId: user.id },
        });

        if (userTeam) {
          redirect("/hub");
        }
      }
      
      if (userRole === "LP") {
        const investor = await prisma.investor.findUnique({
          where: { userId: user.id },
        });

        if (investor) {
          redirect("/lp/dashboard");
        }
      }
      
      const userTeam = await prisma.userTeam.findFirst({
        where: { userId: user.id },
      });

      if (userTeam) {
        redirect("/hub");
      }
    }

    const viewer = await prisma.viewer.findFirst({
      where: {
        email: { equals: userEmail, mode: "insensitive" },
      },
      include: {
        groups: {
          include: {
            group: {
              include: {
                dataroom: {
                  include: {
                    links: {
                      where: {
                        deletedAt: null,
                        isArchived: false,
                      },
                      select: {
                        id: true,
                        domainId: true,
                        domainSlug: true,
                        slug: true,
                      },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (viewer) {
      for (const membership of viewer.groups) {
        const dataroom = membership.group.dataroom;
        const link = dataroom?.links?.[0];
        if (link) {
          const linkUrl = constructLinkUrl(link);
          redirect(linkUrl);
        }
      }
    }

    const linkWithEmail = await prisma.link.findFirst({
      where: {
        allowList: { has: userEmail },
        deletedAt: null,
        isArchived: false,
        dataroomId: { not: null },
      },
      select: {
        id: true,
        domainId: true,
        domainSlug: true,
        slug: true,
      },
    });

    if (linkWithEmail) {
      const linkUrl = constructLinkUrl(linkWithEmail);
      redirect(linkUrl);
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    console.error("[viewer-redirect] Database error:", error);
  }

  redirect("/viewer-portal");
}
