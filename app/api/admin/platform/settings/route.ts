import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { clearPlatformSettingsCache } from "@/lib/auth/paywall";
import { isAdminEmail } from "@/lib/constants/admins";

/**
 * GET /api/admin/platform/settings
 * Returns platform-level settings. Only accessible to platform owner.
 *
 * PATCH /api/admin/platform/settings
 * Updates platform-level settings. Only accessible to platform owner.
 * Body: { paywallEnforced?, paywallBypassUntil?, registrationOpen?, maintenanceMode?, maintenanceMessage? }
 */

async function requirePlatformOwner(req: NextRequest): Promise<{ userId: string; email: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  // Platform owner is anyone in the ADMIN_EMAILS list (from lib/constants/admins.ts)
  if (!isAdminEmail(session.user.email)) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true },
  });

  if (!user?.email) return null;
  return { userId: user.id, email: user.email };
}

export async function GET(req: NextRequest) {
  try {
    const owner = await requirePlatformOwner(req);
    if (!owner) {
      return NextResponse.json({ error: "Unauthorized. Platform owner access required." }, { status: 403 });
    }

    const settings = await prisma.platformSettings.findUnique({
      where: { key: "default" },
    });

    if (!settings) {
      // Return defaults if no record exists yet
      return NextResponse.json({
        paywallEnforced: true,
        paywallBypassUntil: null,
        registrationOpen: true,
        maintenanceMode: false,
        maintenanceMessage: null,
        envPaywallBypass: process.env.PAYWALL_BYPASS === "true",
        updatedAt: null,
        updatedBy: null,
      });
    }

    return NextResponse.json({
      paywallEnforced: settings.paywallEnforced,
      paywallBypassUntil: settings.paywallBypassUntil,
      registrationOpen: settings.registrationOpen,
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
      envPaywallBypass: process.env.PAYWALL_BYPASS === "true",
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const owner = await requirePlatformOwner(req);
    if (!owner) {
      return NextResponse.json({ error: "Unauthorized. Platform owner access required." }, { status: 403 });
    }

    const body = await req.json();
    const { paywallEnforced, paywallBypassUntil, registrationOpen, maintenanceMode, maintenanceMessage } = body;

    // Validate types
    if (paywallEnforced !== undefined && typeof paywallEnforced !== "boolean") {
      return NextResponse.json({ error: "paywallEnforced must be a boolean" }, { status: 400 });
    }
    if (registrationOpen !== undefined && typeof registrationOpen !== "boolean") {
      return NextResponse.json({ error: "registrationOpen must be a boolean" }, { status: 400 });
    }
    if (maintenanceMode !== undefined && typeof maintenanceMode !== "boolean") {
      return NextResponse.json({ error: "maintenanceMode must be a boolean" }, { status: 400 });
    }

    // Build update data
    const updateData: Record<string, unknown> = { updatedBy: owner.userId };
    if (paywallEnforced !== undefined) updateData.paywallEnforced = paywallEnforced;
    if (paywallBypassUntil !== undefined) updateData.paywallBypassUntil = paywallBypassUntil ? new Date(paywallBypassUntil) : null;
    if (registrationOpen !== undefined) updateData.registrationOpen = registrationOpen;
    if (maintenanceMode !== undefined) updateData.maintenanceMode = maintenanceMode;
    if (maintenanceMessage !== undefined) updateData.maintenanceMessage = maintenanceMessage || null;

    const settings = await prisma.platformSettings.upsert({
      where: { key: "default" },
      create: {
        key: "default",
        ...updateData,
      },
      update: updateData,
    });

    // Clear the paywall cache so changes take effect immediately
    clearPlatformSettingsCache();

    // Audit log
    await logAuditEvent({
      userId: owner.userId,
      eventType: "SETTINGS_UPDATED",
      resourceType: "PlatformSettings",
      resourceId: settings.id,
      metadata: { changes: updateData },
    }).catch((e) => reportError(e as Error)); // Fire-and-forget

    return NextResponse.json({
      success: true,
      paywallEnforced: settings.paywallEnforced,
      paywallBypassUntil: settings.paywallBypassUntil,
      registrationOpen: settings.registrationOpen,
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
