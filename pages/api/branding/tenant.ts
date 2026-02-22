import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { isPlatformDomain, isInfrastructureDomain } from "@/lib/constants/saas-config";

export interface TenantBrandingResponse {
  isTenant: boolean;
  orgName?: string;
  orgLogo?: string | null;
  orgBrandColor?: string | null;
  orgAccentColor?: string | null;
  orgFavicon?: string | null;
  orgDescription?: string | null;
  teamName?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TenantBrandingResponse | { error: string }>,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const host = (req.query.host as string) || req.headers.host || "";
  const cleanHost = host.split(":")[0];

  if (!cleanHost || isPlatformDomain(cleanHost) || isInfrastructureDomain(cleanHost)) {
    return res.status(200).json({ isTenant: false });
  }

  try {
    const domain = await prisma.domain.findUnique({
      where: { slug: cleanHost },
      include: {
        team: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!domain || !domain.team) {
      return res.status(200).json({ isTenant: false });
    }

    const org = domain.team.organization;

    return res.status(200).json({
      isTenant: true,
      orgName: org?.name || domain.team.name,
      orgLogo: org?.logo || null,
      orgBrandColor: org?.brandColor || null,
      orgAccentColor: org?.accentColor || null,
      orgFavicon: org?.favicon || null,
      orgDescription: org?.description || null,
      teamName: domain.team.name,
    });
  } catch (error: unknown) {
    reportError(error, { context: "tenant-branding-api", host: cleanHost });
    return res.status(200).json({ isTenant: false });
  }
}
