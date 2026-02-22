import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

interface TimelineEvent {
  id: string;
  type: "view" | "signature" | "document" | "note";
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    documentName?: string;
    pageCount?: number;
    duration?: number;
    status?: string;
    ipAddress?: string;
  };
}

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search");
    const limit = searchParams.get("limit") || "50";
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { investorProfile: true },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const investorEmail = auth.email;
    const events: TimelineEvent[] = [];

    const views = await prisma.view.findMany({
      where: {
        viewerEmail: investorEmail,
        ...(search
          ? {
              OR: [
                {
                  document: {
                    name: { contains: search, mode: "insensitive" },
                  },
                },
                {
                  dataroom: {
                    name: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        document: { select: { name: true } },
        dataroom: { select: { name: true } },
        pageViews: {
          select: { duration: true, pageNumber: true },
        },
      },
      orderBy: { viewedAt: "desc" },
      take: limitNum,
    });

    for (const view of views) {
      const totalDuration = view.pageViews.reduce(
        (sum, pv) => sum + (pv.duration || 0),
        0,
      );
      const pageCount = view.pageViews.length;

      events.push({
        id: `view-${view.id}`,
        type: "view",
        title:
          view.document?.name || view.dataroom?.name || "Document View",
        description: view.dataroom
          ? `Viewed dataroom${pageCount > 0 ? ` (${pageCount} pages)` : ""}`
          : `Viewed document${pageCount > 0 ? ` (${pageCount} pages)` : ""}`,
        timestamp: view.viewedAt.toISOString(),
        metadata: {
          documentName: view.document?.name || view.dataroom?.name,
          pageCount,
          duration: totalDuration,
        },
      });
    }

    const signatureEvents = await prisma.signatureAuditLog.findMany({
      where: {
        recipientEmail: investorEmail,
        ...(search
          ? {
              OR: [
                { event: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limitNum,
    });

    for (const sig of signatureEvents) {
      const eventLabels: Record<string, string> = {
        "document.viewed": "Viewed signature document",
        "recipient.signed": "Signed document",
        "recipient.declined": "Declined to sign",
        "document.completed": "Document completed",
        "document.sent": "Received document for signature",
      };

      events.push({
        id: `sig-${sig.id}`,
        type: "signature",
        title: eventLabels[sig.event] || sig.event,
        description: sig.recipientEmail || "Signature event",
        timestamp: sig.createdAt.toISOString(),
        metadata: {
          status: sig.event,
          ipAddress: sig.ipAddress || undefined,
        },
      });
    }

    const investorDocs = await prisma.investorDocument.findMany({
      where: {
        investorId: user.investorProfile.id,
        ...(search
          ? {
              title: { contains: search, mode: "insensitive" },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limitNum,
    });

    for (const doc of investorDocs) {
      events.push({
        id: `doc-${doc.id}`,
        type: "document",
        title: doc.title,
        description: doc.signedAt
          ? `Signed on ${new Date(doc.signedAt).toLocaleDateString()}`
          : doc.documentType,
        timestamp: doc.createdAt.toISOString(),
        metadata: {
          documentName: doc.title,
          status: doc.signedAt ? "signed" : "pending",
        },
      });
    }

    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return NextResponse.json({
      events: events.slice(0, limitNum),
      total: events.length,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Timeline fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
