import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard-activity
 *
 * Returns recent activity feed for the GP dashboard:
 * - Audit log events (investor stage changes, document reviews, wire confirmations)
 * - Recent dataroom views
 * - Recent commitments
 *
 * Query params: limit (default 20)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20") || 20, 50);

    // Get all admin teams for cross-team activity feed
    const adminTeams = await prisma.userTeam.findMany({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    const teamIds = adminTeams.map((t: { teamId: string }) => t.teamId);

    // Fetch recent audit log events and dataroom views in parallel
    const [auditEvents, recentViews] = await Promise.all([
      // Recent audit log events for the team
      prisma.auditLog.findMany({
        where: {
          teamId: { in: teamIds },
          eventType: {
            in: [
              "INVESTOR_STAGE_CHANGE",
              "INVESTOR_APPROVED",
              "INVESTOR_REJECTED",
              "DOCUMENT_APPROVED",
              "DOCUMENT_REJECTED",
              "DOCUMENT_UPLOADED",
              "WIRE_CONFIRMED",
              "WIRE_PROOF_UPLOADED",
              "INVESTMENT_CREATED",
              "NDA_SIGNED",
              "INVESTOR_CREATED",
              "SIGNATURE_COMPLETED",
              "FUNDROOM_ACTIVATED",
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          eventType: true,
          resourceType: true,
          resourceId: true,
          userId: true,
          user: { select: { email: true } },
          metadata: true,
          createdAt: true,
        },
      }),

      // Recent dataroom views
      prisma.view.findMany({
        where: {
          dataroom: { teamId: { in: teamIds } },
        },
        orderBy: { viewedAt: "desc" },
        take: 10,
        select: {
          id: true,
          viewerEmail: true,
          viewedAt: true,
          dataroom: {
            select: { name: true },
          },
        },
      }),
    ]);

    // Build unified activity feed
    const activities: Array<{
      id: string;
      type: string;
      description: string;
      actor: string | null;
      timestamp: string;
      icon: string;
      link?: string;
    }> = [];

    // Map audit events to activity items
    for (const event of auditEvents) {
      const meta = event.metadata as Record<string, unknown> | null;
      let description = "";
      let icon = "activity";

      switch (event.eventType) {
        case "INVESTOR_STAGE_CHANGE":
          description = `Investor moved to ${meta?.toStage || "new stage"}`;
          icon = "stage";
          break;
        case "INVESTOR_APPROVED":
          description = "Investor approved";
          icon = "approve";
          break;
        case "INVESTOR_REJECTED":
          description = "Investor rejected";
          icon = "reject";
          break;
        case "DOCUMENT_APPROVED":
          description = "Document approved";
          icon = "document";
          break;
        case "DOCUMENT_REJECTED":
          description = "Document rejected";
          icon = "document";
          break;
        case "DOCUMENT_UPLOADED":
          description = "New document uploaded";
          icon = "upload";
          break;
        case "WIRE_CONFIRMED":
          description = "Wire transfer confirmed";
          icon = "wire";
          break;
        case "WIRE_PROOF_UPLOADED":
          description = "Wire proof uploaded";
          icon = "wire";
          break;
        case "INVESTMENT_CREATED":
          description = "New commitment received";
          icon = "commitment";
          break;
        case "NDA_SIGNED":
          description = "NDA signed";
          icon = "sign";
          break;
        case "INVESTOR_CREATED":
          description = "New investor registered";
          icon = "investor";
          break;
        case "SIGNATURE_COMPLETED":
          description = "Document signed";
          icon = "sign";
          break;
        case "FUNDROOM_ACTIVATED":
          description = "FundRoom activated";
          icon = "activate";
          break;
        default:
          description = event.eventType.replace(/_/g, " ").toLowerCase();
          icon = "activity";
      }

      activities.push({
        id: event.id,
        type: event.eventType,
        description,
        actor: event.user?.email || null,
        timestamp: event.createdAt.toISOString(),
        icon,
        link:
          event.resourceType === "Investor"
            ? `/admin/investors/${event.resourceId}`
            : undefined,
      });
    }

    // Add recent dataroom views
    for (const view of recentViews) {
      activities.push({
        id: `view-${view.id}`,
        type: "DATAROOM_VIEW",
        description: `Viewed ${view.dataroom?.name || "dataroom"}`,
        actor: view.viewerEmail || null,
        timestamp: view.viewedAt.toISOString(),
        icon: "view",
      });
    }

    // Sort by timestamp descending
    activities.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return NextResponse.json({
      activities: activities.slice(0, limit),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[DASHBOARD_ACTIVITY] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
