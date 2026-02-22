import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

interface OfferingDocument {
  id: string;
  name: string;
  description: string;
  url: string;
  version: string;
  required: boolean;
  order: number;
}

const DEFAULT_OFFERING_DOCUMENTS: OfferingDocument[] = [
  {
    id: "lpa",
    name: "Limited Partnership Agreement",
    description: "The legal agreement between the GP and LPs",
    url: "/fund-documents/LPA.pdf",
    version: "4.0",
    required: true,
    order: 1,
  },
  {
    id: "ppm",
    name: "Private Placement Memorandum",
    description: "Investment risks, terms, and fund strategy",
    url: "/fund-documents/PPM.pdf",
    version: "2.0",
    required: true,
    order: 2,
  },
  {
    id: "subscription",
    name: "Subscription Agreement",
    description: "Investment subscription form",
    url: "/fund-documents/Subscription-Agreement.pdf",
    version: "2.0",
    required: true,
    order: 3,
  },
];

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const investor = await prisma.investor.findFirst({
      where: {
        OR: [
          { userId: auth.userId },
          { user: { email: auth.email } },
        ],
      },
      include: {
        fund: true,
      },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    let documents: OfferingDocument[] = DEFAULT_OFFERING_DOCUMENTS;

    if (investor.fund) {
      const fundData = investor.fund as any;
      if (
        fundData.offeringDocuments &&
        Array.isArray(fundData.offeringDocuments)
      ) {
        documents = fundData.offeringDocuments;
      }
    }

    documents.sort((a, b) => a.order - b.order);

    return NextResponse.json({
      documents,
      fundName: investor.fund?.name || "Fund",
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[OFFERING_DOCUMENTS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
