/**
 * POST /api/contacts/import — CSV import with tier-aware limits.
 *
 * Accepts JSON body: { rows: Array<{ email, firstName?, lastName?, company?, phone?, tags? }> }
 * (CSV parsing done on client side for simplicity and better error handling)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

interface ImportRow {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  tags?: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: { team: { select: { id: true, organizationId: true } } },
    });
    if (!userTeam?.team?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 403 });
    }

    const teamId = userTeam.team.id;
    const orgId = userTeam.team.organizationId;
    const tier = await resolveOrgTier(orgId);

    const body = await req.json();
    const rows: ImportRow[] = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 });
    }

    // Get existing contact emails for dedup
    const existingContacts = await prisma.contact.findMany({
      where: { teamId },
      select: { email: true },
    });
    const existingEmails = new Set(existingContacts.map((c) => c.email.toLowerCase()));

    // Current count for limit check
    const currentCount = existingEmails.size;
    const contactLimit = tier.maxContacts;

    let imported = 0;
    let skipped = 0;
    let overLimit = 0;
    let invalid = 0;
    const errors: Array<{ row: number; email: string; reason: string }> = [];

    const validRows: Array<ImportRow & { email: string }> = [];

    // Validate and deduplicate
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.email || !EMAIL_REGEX.test(row.email.trim())) {
        invalid++;
        errors.push({ row: i + 1, email: row.email || "", reason: "Invalid email" });
        continue;
      }

      const email = row.email.trim().toLowerCase();

      if (existingEmails.has(email)) {
        skipped++;
        continue;
      }

      // Dedup within the import batch itself
      if (validRows.some((r) => r.email === email)) {
        skipped++;
        continue;
      }

      // Check limit for FREE tier
      if (contactLimit !== null && currentCount + validRows.length >= contactLimit) {
        overLimit++;
        continue;
      }

      validRows.push({ ...row, email });
    }

    // Batch create
    if (validRows.length > 0) {
      await prisma.contact.createMany({
        data: validRows.map((row) => ({
          teamId,
          email: row.email,
          firstName: row.firstName?.trim() || null,
          lastName: row.lastName?.trim() || null,
          company: row.company?.trim() || null,
          phone: row.phone?.trim() || null,
          tags: row.tags ? (row.tags as unknown as import("@prisma/client").Prisma.InputJsonValue) : undefined,
          source: "BULK_IMPORT",
          status: "PROSPECT",
        })),
        skipDuplicates: true,
      });
      imported = validRows.length;
    }

    // Audit log
    await logAuditEvent({
      eventType: "CONTACT_IMPORTED",
      userId: session.user.id,
      teamId,
      resourceType: "Contact",
      resourceId: teamId,
      metadata: { imported, skipped, overLimit, invalid, totalRows: rows.length },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      imported,
      skipped,
      overLimit,
      invalid,
      errors: errors.slice(0, 20), // Return first 20 errors
      upgradeNeeded: overLimit > 0,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
