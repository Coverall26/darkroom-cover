import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/manual-investment/[id]
 *
 * Get a single manual investment by ID.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Investment ID required" }, { status: 400 });
  }

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 });
  }

  const investment = await prisma.manualInvestment.findFirst({
    where: { id, teamId: userTeam.teamId },
  });

  if (!investment) {
    return NextResponse.json({ error: "Investment not found" }, { status: 404 });
  }

  return NextResponse.json({ investment });
}

/**
 * PUT /api/admin/manual-investment/[id]
 *
 * Update a manual investment record.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Investment ID required" }, { status: 400 });
  }

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 });
  }

  const teamId = userTeam.teamId;
  const userId = session.user.id;

  const existingInvestment = await prisma.manualInvestment.findFirst({
    where: { id, teamId },
  });

  if (!existingInvestment) {
    return NextResponse.json({ error: "Investment not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "documentType",
      "documentTitle",
      "documentNumber",
      "commitmentAmount",
      "fundedAmount",
      "units",
      "shares",
      "pricePerUnit",
      "ownershipPercent",
      "signedDate",
      "effectiveDate",
      "fundedDate",
      "maturityDate",
      "transferMethod",
      "transferStatus",
      "transferDate",
      "transferRef",
      "bankName",
      "accountLast4",
      "notes",
      "status",
      "isVerified",
    ];

    const decimalFields = [
      "commitmentAmount",
      "fundedAmount",
      "units",
      "shares",
      "pricePerUnit",
      "ownershipPercent",
    ];

    const dateFields = [
      "signedDate",
      "effectiveDate",
      "fundedDate",
      "maturityDate",
      "transferDate",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (decimalFields.includes(field) && body[field] !== null) {
          updateData[field] = new Prisma.Decimal(body[field]);
        } else if (dateFields.includes(field) && body[field]) {
          updateData[field] = new Date(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    if (updateData.commitmentAmount !== undefined || updateData.fundedAmount !== undefined) {
      const commitment = updateData.commitmentAmount || existingInvestment.commitmentAmount;
      const funded = updateData.fundedAmount || existingInvestment.fundedAmount;
      updateData.unfundedAmount = new Prisma.Decimal(
        commitment as string | number,
      ).minus(new Prisma.Decimal(funded as string | number));
    }

    if (updateData.isVerified === true && !existingInvestment.isVerified) {
      updateData.verifiedBy = userId;
      updateData.verifiedAt = new Date();
    }

    const existingAudit =
      (existingInvestment.auditTrail as Record<string, unknown>) || {};
    const existingUpdates = (existingAudit.updates as unknown[]) || [];
    const forwarded = req.headers.get("x-forwarded-for");

    updateData.auditTrail = {
      ...existingAudit,
      updates: [
        ...existingUpdates,
        {
          by: userId,
          at: new Date().toISOString(),
          changes: Object.keys(updateData).filter((k) => k !== "auditTrail"),
          ip: forwarded || null,
        },
      ],
    };

    const investment = await prisma.manualInvestment.update({
      where: { id },
      data: updateData,
      include: {
        investor: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        fund: { select: { id: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        teamId,
        eventType: "MANUAL_INVESTMENT_UPDATED",
        resourceType: "MANUAL_INVESTMENT",
        resourceId: id,
        userId,
        metadata: {
          changes: Object.keys(updateData).filter((k) => k !== "auditTrail"),
        },
        ipAddress: forwarded?.split(",")[0].trim() || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    return NextResponse.json({ investment });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/manual-investment/[id]
 *
 * Delete a manual investment record.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Investment ID required" }, { status: 400 });
  }

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 });
  }

  const teamId = userTeam.teamId;
  const userId = session.user.id;

  const existingInvestment = await prisma.manualInvestment.findFirst({
    where: { id, teamId },
  });

  if (!existingInvestment) {
    return NextResponse.json({ error: "Investment not found" }, { status: 404 });
  }

  try {
    await prisma.manualInvestment.delete({
      where: { id },
    });

    const forwarded = req.headers.get("x-forwarded-for");

    await prisma.auditLog.create({
      data: {
        teamId,
        eventType: "MANUAL_INVESTMENT_DELETED",
        resourceType: "MANUAL_INVESTMENT",
        resourceId: id,
        userId,
        metadata: {},
        ipAddress: forwarded?.split(",")[0].trim() || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    return NextResponse.json({ message: "Investment deleted" });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
