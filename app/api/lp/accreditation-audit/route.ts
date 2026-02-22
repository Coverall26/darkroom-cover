import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/lp/accreditation-audit
 * Logs individual per-checkbox audit events for SEC accreditation certifications.
 * Each checkbox write fires a SEPARATE audit event with:
 *   - IP address, timestamp, user agent
 *   - Exact text certified
 *   - Certification index (1-based)
 *   - Whether it was checked or unchecked
 *
 * For 506(c) offerings, there are 3 additional individually timestamped checkboxes
 * that each get their own audit event.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const {
      fundId,
      certificationIndex,
      certificationText,
      certificationField,
      checked,
      certificationCategory,
    } = body;

    // Validate required fields
    if (
      certificationIndex == null ||
      !certificationText ||
      !certificationField ||
      typeof checked !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Missing required fields: certificationIndex, certificationText, certificationField, checked" },
        { status: 400 },
      );
    }

    if (!auth.investorId) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    // Resolve teamId for scoping
    const teamId = fundId
      ? (
          await prisma.fund.findUnique({
            where: { id: fundId },
            select: { teamId: true },
          })
        )?.teamId
      : undefined;

    const now = new Date();
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // Log the individual checkbox certification event
    await logAuditEvent(
      {
        eventType: "ACCREDITATION_SUBMITTED",
        userId: auth.userId,
        teamId: teamId || undefined,
        resourceType: "Investor",
        resourceId: auth.investorId,
        metadata: {
          certificationIndex: Number(certificationIndex),
          certificationField: String(certificationField).slice(0, 100),
          certificationText: String(certificationText).slice(0, 1000),
          checked,
          certificationCategory: certificationCategory || "STANDARD",
          fundId: fundId || null,
          timestamp: now.toISOString(),
          ipAddress,
          userAgent: req.headers.get("user-agent"),
        },
      },
      { useImmutableChain: true }, // SEC 506(c) compliance requires immutable chain
    );

    return NextResponse.json({
      success: true,
      auditedAt: now.toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
