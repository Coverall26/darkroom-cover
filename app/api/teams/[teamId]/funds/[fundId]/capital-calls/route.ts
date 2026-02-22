import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import type { Role } from "@prisma/client";

/**
 * GET /api/teams/[teamId]/funds/[fundId]/capital-calls
 * List capital calls for a fund with optional status filter.
 *
 * POST /api/teams/[teamId]/funds/[fundId]/capital-calls
 * Create a new capital call (DRAFT). Auto-generates CapitalCallResponse
 * rows for each active investor.
 */

const GP_ROLES: Role[] = ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"];

async function verifyGPAccess(
  teamId: string,
  fundId: string,
  userId: string,
) {
  const userTeam = await prisma.userTeam.findFirst({
    where: { teamId, userId, role: { in: GP_ROLES }, status: "ACTIVE" },
  });
  if (!userTeam) return null;

  const fund = await prisma.fund.findFirst({
    where: { id: fundId, teamId },
  });
  if (!fund) return null;

  return { userTeam, fund };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; fundId: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId } = await params;

  try {
    const access = await verifyGPAccess(teamId, fundId, session.user.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const calls = await prisma.capitalCall.findMany({
      where: {
        fundId,
        ...(status ? { status: status as any } : {}),
      },
      include: {
        responses: {
          include: {
            investor: {
              select: { id: true, entityName: true, user: { select: { email: true, name: true } } },
            },
          },
        },
      },
      orderBy: { callNumber: "desc" },
    });

    // Convert Decimal to number for JSON serialization
    const serialized = calls.map((call) => ({
      ...call,
      amount: call.amount.toNumber(),
      proRataPercentage: call.proRataPercentage?.toNumber() ?? null,
      responses: call.responses.map((r) => ({
        ...r,
        amountDue: r.amountDue.toNumber(),
        amountPaid: r.amountPaid.toNumber(),
      })),
    }));

    return NextResponse.json({ calls: serialized });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; fundId: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId } = await params;

  try {
    const access = await verifyGPAccess(teamId, fundId, session.user.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { callNumber, amount, purpose, dueDate, proRataPercentage } = body;

    // Validation
    if (!amount || amount <= 0 || amount > 100_000_000_000) {
      return NextResponse.json(
        { error: "Amount must be between 0 and $100B" },
        { status: 400 },
      );
    }

    if (!dueDate) {
      return NextResponse.json(
        { error: "Due date is required" },
        { status: 400 },
      );
    }

    const parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid due date" },
        { status: 400 },
      );
    }

    if (
      proRataPercentage !== undefined &&
      proRataPercentage !== null &&
      (proRataPercentage <= 0 || proRataPercentage > 100)
    ) {
      return NextResponse.json(
        { error: "Pro-rata percentage must be between 0 and 100" },
        { status: 400 },
      );
    }

    // Auto-suggest call number if not provided
    let finalCallNumber = callNumber;
    if (!finalCallNumber) {
      const maxCall = await prisma.capitalCall.findFirst({
        where: { fundId },
        orderBy: { callNumber: "desc" },
        select: { callNumber: true },
      });
      finalCallNumber = (maxCall?.callNumber || 0) + 1;
    }

    // Create capital call + response rows in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const call = await tx.capitalCall.create({
        data: {
          fundId,
          callNumber: finalCallNumber,
          amount,
          purpose: purpose || null,
          dueDate: parsedDueDate,
          proRataPercentage: proRataPercentage
            ? proRataPercentage / 100
            : null, // Store as decimal (25% → 0.25)
          status: "DRAFT",
          createdBy: session.user.id,
        },
      });

      // Get active investors with funded/committed investments
      const investments = await tx.investment.findMany({
        where: {
          fundId,
          status: { in: ["FUNDED", "COMMITTED", "DOCS_APPROVED"] },
        },
        include: {
          investor: {
            select: { id: true, entityName: true },
          },
        },
      });

      // Create response rows for each active investor
      const responseData = investments.map((inv) => {
        let amountDue = 0;
        if (proRataPercentage) {
          // Pro-rata: calculate based on commitment
          amountDue =
            Number(inv.commitmentAmount || 0) * (proRataPercentage / 100);
        }
        // If no pro-rata, amountDue = 0 (GP fills in manually)

        return {
          capitalCallId: call.id,
          investorId: inv.investorId,
          amountDue,
          status: "PENDING" as const,
        };
      });

      if (responseData.length > 0) {
        await tx.capitalCallResponse.createMany({
          data: responseData,
        });
      }

      // Return with responses
      const fullCall = await tx.capitalCall.findUnique({
        where: { id: call.id },
        include: {
          responses: {
            include: {
              investor: {
                select: {
                  id: true,
                  entityName: true,
                  user: { select: { email: true } },
                },
              },
            },
          },
        },
      });

      return fullCall!;
    });

    // Audit log
    logAuditEvent({
      eventType: "CAPITAL_CALL_CREATED",
      userId: session.user.id,
      teamId,
      resourceType: "CapitalCall",
      resourceId: result.id,
      metadata: {
        callNumber: finalCallNumber,
        amount,
        investorCount: result.responses.length,
      },
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
      userAgent: req.headers.get("user-agent"),
    }).catch((e) => reportError(e as Error));

    // Serialize decimals
    const serialized = {
      ...result,
      amount: result.amount.toNumber(),
      proRataPercentage: result.proRataPercentage?.toNumber() ?? null,
      responses: result.responses.map((r) => ({
        ...r,
        amountDue: r.amountDue.toNumber(),
        amountPaid: r.amountPaid.toNumber(),
      })),
    };

    return NextResponse.json(serialized, { status: 201 });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
