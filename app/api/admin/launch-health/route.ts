import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/launch-health
 *
 * Launch health dashboard endpoint for monitoring platform readiness.
 * Returns aggregated metrics on errors, user activity, feature adoption,
 * and system health. Admin-only.
 */
export async function GET() {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel for speed
    const [
      totalUsers,
      newUsers24h,
      newUsers7d,
      totalTeams,
      totalOrgs,
      totalDocuments,
      totalLinks,
      totalDatarooms,
      totalViews24h,
      totalViews7d,
      totalViews30d,
      recentAuditErrors,
      activeTeams7d,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: last24h } } }),
      prisma.user.count({ where: { createdAt: { gte: last7d } } }),
      prisma.team.count({ where: { deletedAt: null } }),
      prisma.organization.count(),
      prisma.document.count({ where: { deletedAt: null } }),
      prisma.link.count(),
      prisma.dataroom.count({ where: { deletedAt: null } }),
      prisma.view.count({ where: { viewedAt: { gte: last24h } } }),
      prisma.view.count({ where: { viewedAt: { gte: last7d } } }),
      prisma.view.count({ where: { viewedAt: { gte: last30d } } }),
      prisma.auditLog.count({
        where: {
          createdAt: { gte: last24h },
          eventType: { in: ["PAYMENT_FAILED", "KYC_FAILED"] },
        },
      }),
      prisma.view
        .groupBy({
          by: ["teamId"],
          where: { viewedAt: { gte: last7d }, teamId: { not: null } },
        })
        .then((groups) => groups.length),
    ]);

    // Calculate health score (0-100)
    const healthFactors = {
      hasUsers: totalUsers > 0 ? 20 : 0,
      hasDocuments: totalDocuments > 0 ? 15 : 0,
      hasLinks: totalLinks > 0 ? 15 : 0,
      hasRecentViews: totalViews24h > 0 ? 20 : 0,
      lowErrorRate:
        recentAuditErrors < 10 ? 15 : recentAuditErrors < 50 ? 8 : 0,
      hasActiveTeams: activeTeams7d > 0 ? 15 : 0,
    };
    const healthScore = Object.values(healthFactors).reduce(
      (sum, v) => sum + v,
      0,
    );

    const response = {
      status:
        healthScore >= 80
          ? "healthy"
          : healthScore >= 50
            ? "degraded"
            : "critical",
      healthScore,
      healthFactors,
      timestamp: now.toISOString(),
      metrics: {
        users: {
          total: totalUsers,
          new24h: newUsers24h,
          new7d: newUsers7d,
        },
        resources: {
          teams: totalTeams,
          organizations: totalOrgs,
          documents: totalDocuments,
          links: totalLinks,
          datarooms: totalDatarooms,
        },
        activity: {
          views24h: totalViews24h,
          views7d: totalViews7d,
          views30d: totalViews30d,
          activeTeams7d: activeTeams7d,
        },
        errors: {
          auditErrors24h: recentAuditErrors,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    reportError(error, {
      path: "/api/admin/launch-health",
      action: "launch_health",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
