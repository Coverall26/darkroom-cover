import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit/export
 *
 * Export audit logs with filters (startDate, endDate, eventType, resourceType).
 * Supports JSON and CSV format.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as CustomUser;

    const adminTeam = await prisma.userTeam.findFirst({
      where: {
        userId: user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      include: {
        team: true,
      },
    });

    if (!adminTeam) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const searchParams = new URL(req.url).searchParams;
    const format = searchParams.get("format") || "json";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const eventType = searchParams.get("eventType");
    const resourceType = searchParams.get("resourceType");
    const limit = searchParams.get("limit") || "1000";
    const download = searchParams.get("download");

    const where: Record<string, unknown> = {
      OR: [
        { teamId: adminTeam.teamId },
        {
          user: {
            teams: {
              some: { teamId: adminTeam.teamId },
            },
          },
        },
      ],
    };

    if (startDate) {
      where.createdAt = {
        ...(where.createdAt as Record<string, unknown> || {}),
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.createdAt = {
        ...(where.createdAt as Record<string, unknown> || {}),
        lte: new Date(endDate),
      };
    }

    if (eventType) {
      where.eventType = eventType;
    }

    if (resourceType) {
      where.resourceType = resourceType;
    }

    const auditLogs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit, 10), 10000),
    });

    const formattedLogs = auditLogs.map((log: {
      id: string;
      createdAt: Date;
      eventType: string;
      resourceType: string | null;
      resourceId: string | null;
      user: { id: string; name: string | null; email: string | null } | null;
      ipAddress: string | null;
      userAgent: string | null;
      metadata: unknown;
    }) => ({
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      eventType: log.eventType,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      user: log.user ? {
        id: log.user.id,
        name: log.user.name,
        email: log.user.email,
      } : null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata,
    }));

    if (format === "csv") {
      const csvHeaders = [
        "ID",
        "Timestamp",
        "Event Type",
        "Resource Type",
        "Resource ID",
        "User ID",
        "User Name",
        "User Email",
        "IP Address",
        "User Agent",
      ].join(",");

      const csvRows = formattedLogs.map((log: {
        id: string;
        timestamp: string;
        eventType: string;
        resourceType: string | null;
        resourceId: string | null;
        user: { id: string; name: string | null; email: string | null } | null;
        ipAddress: string | null;
        userAgent: string | null;
      }) => [
        log.id,
        log.timestamp,
        log.eventType,
        log.resourceType || "",
        log.resourceId || "",
        log.user?.id || "",
        `"${(log.user?.name || "").replace(/"/g, '""')}"`,
        log.user?.email || "",
        log.ipAddress || "",
        `"${(log.userAgent || "").replace(/"/g, '""')}"`,
      ].join(","));

      const csv = [csvHeaders, ...csvRows].join("\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (download === "true") {
      headers["Content-Disposition"] = `attachment; filename="audit-log-${new Date().toISOString().split("T")[0]}.json"`;
    }

    return NextResponse.json({
      success: true,
      count: formattedLogs.length,
      exportedAt: new Date().toISOString(),
      team: {
        id: adminTeam.team.id,
        name: adminTeam.team.name,
      },
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        eventType: eventType || null,
        resourceType: resourceType || null,
      },
      logs: formattedLogs,
    }, {
      status: 200,
      headers,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
