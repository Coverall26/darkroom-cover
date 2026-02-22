/**
 * GET /api/outreach/unsubscribe — One-click unsubscribe from CRM outreach emails.
 *
 * Query params: cid (contactId), tid (teamId)
 * Sets Contact.unsubscribedAt timestamp.
 * Returns a simple HTML confirmation page.
 *
 * Public endpoint — no auth required (linked from emails).
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get("cid");
    const teamId = searchParams.get("tid");

    if (!contactId || !teamId) {
      return new NextResponse(renderHtml("Invalid unsubscribe link."), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Verify contact exists and belongs to team
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, teamId },
      select: { id: true, email: true, unsubscribedAt: true },
    });

    if (!contact) {
      return new NextResponse(renderHtml("Contact not found."), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Already unsubscribed
    if (contact.unsubscribedAt) {
      return new NextResponse(
        renderHtml("You have already been unsubscribed from our emails."),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    // Set unsubscribe timestamp
    await prisma.contact.update({
      where: { id: contactId },
      data: { unsubscribedAt: new Date() },
    });

    // Log activity
    await prisma.contactActivity.create({
      data: {
        contactId,
        type: "PROFILE_UPDATED",
        description: "Unsubscribed from outreach emails",
        metadata: {
          action: "unsubscribe",
          ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          unsubscribedAt: new Date().toISOString(),
        },
      },
    }).catch((e) => reportError(e as Error));

    return new NextResponse(
      renderHtml("You have been unsubscribed. You will no longer receive outreach emails from us."),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    reportError(error as Error);
    return new NextResponse(renderHtml("An error occurred. Please try again."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

// POST handler for List-Unsubscribe-Post header (RFC 8058)
export async function POST(req: NextRequest) {
  return GET(req);
}

// ---------------------------------------------------------------------------
// Simple HTML response
// ---------------------------------------------------------------------------

function renderHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribe — FundRoom</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: white; border-radius: 12px; padding: 2rem; max-width: 400px; box-shadow: 0 1px 3px rgba(0,0,0,.1); text-align: center; }
    h1 { font-size: 1.25rem; color: #0A1628; margin-bottom: 0.5rem; }
    p { color: #6b7280; font-size: 0.875rem; line-height: 1.5; }
    .logo { font-weight: 700; color: #0066FF; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">FundRoom</div>
    <h1>Email Preferences</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
