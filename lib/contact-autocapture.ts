/**
 * Contact Auto-Capture — Creates CRM contacts from dataroom viewer events.
 *
 * Called whenever a new ViewerEvent (View record) is created with an email address.
 * If the email doesn't already exist as a Contact, creates one (or a PendingContact
 * if the org is on FREE tier at their contact limit).
 */

import prisma from "@/lib/prisma";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { reportError } from "@/lib/error";

/**
 * Parse a name from an email address.
 * e.g., "john.smith@example.com" → { firstName: "John", lastName: "Smith" }
 *       "jsmith@example.com" → { firstName: "Jsmith", lastName: null }
 */
function parseNameFromEmail(email: string): { firstName: string | null; lastName: string | null } {
  const localPart = email.split("@")[0] || "";
  // Try splitting on . or _ or -
  const parts = localPart.split(/[._-]/).filter(Boolean);

  if (parts.length >= 2) {
    return {
      firstName: titleCase(parts[0]),
      lastName: titleCase(parts.slice(1).join(" ")),
    };
  }

  if (parts.length === 1) {
    return { firstName: titleCase(parts[0]), lastName: null };
  }

  return { firstName: null, lastName: null };
}

function titleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Handle a dataroom viewer event — auto-capture as CRM contact.
 *
 * @param teamId - The team that owns the dataroom
 * @param email - Viewer's email address
 * @param viewerEventId - The View record ID (optional)
 * @param viewerName - Optional name from the email gate form
 */
export async function handleDataroomViewerCapture(
  teamId: string,
  email: string,
  viewerEventId?: string,
  viewerName?: string,
): Promise<void> {
  if (!email || !teamId) return;

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check if Contact already exists for this team + email
    const existingContact = await prisma.contact.findUnique({
      where: { teamId_email: { teamId, email: normalizedEmail } },
    });

    if (existingContact) {
      // Update engagement: increment score, update lastEngagedAt
      await prisma.contact.update({
        where: { id: existingContact.id },
        data: {
          engagementScore: { increment: 1 },
          lastEngagedAt: new Date(),
        },
      });

      // Log activity
      await prisma.contactActivity.create({
        data: {
          contactId: existingContact.id,
          type: "DOCUMENT_VIEWED",
          description: "Viewed dataroom document",
          metadata: viewerEventId ? { viewerEventId } : undefined,
        },
      });

      return;
    }

    // Resolve org from team
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team?.organizationId) return;

    const orgId = team.organizationId;
    const tier = await resolveOrgTier(orgId);

    // Check if at contact limit (FREE tier)
    if (tier.maxContacts !== null) {
      const currentCount = await prisma.contact.count({ where: { teamId } });
      if (currentCount >= tier.maxContacts) {
        // At limit — create PendingContact instead
        await prisma.pendingContact.upsert({
          where: { orgId_email: { orgId, email: normalizedEmail } },
          create: {
            orgId,
            email: normalizedEmail,
            firstName: viewerName?.split(" ")[0] || parseNameFromEmail(normalizedEmail).firstName,
            lastName: viewerName?.split(" ").slice(1).join(" ") || parseNameFromEmail(normalizedEmail).lastName,
            source: "DATAROOM_VIEW",
            viewerEventId,
          },
          update: {}, // Already exists, skip
        });
        return;
      }
    }

    // Parse name (prefer viewerName from email gate form)
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (viewerName) {
      const parts = viewerName.trim().split(/\s+/);
      firstName = parts[0] || null;
      lastName = parts.slice(1).join(" ") || null;
    } else {
      const parsed = parseNameFromEmail(normalizedEmail);
      firstName = parsed.firstName;
      lastName = parsed.lastName;
    }

    // Create new Contact
    const contact = await prisma.contact.create({
      data: {
        teamId,
        email: normalizedEmail,
        firstName,
        lastName,
        source: "DATAROOM_VIEW",
        status: "PROSPECT",
        engagementScore: 1,
        lastEngagedAt: new Date(),
        referralSource: "dataroom",
      },
    });

    // Create activity
    await prisma.contactActivity.create({
      data: {
        contactId: contact.id,
        type: "CREATED",
        description: "Auto-captured from dataroom view",
        metadata: viewerEventId ? { viewerEventId } : undefined,
      },
    });

    // Remove from PendingContact if exists
    await prisma.pendingContact.deleteMany({
      where: { orgId, email: normalizedEmail },
    }).catch((e) => reportError(e as Error)); // Non-blocking

  } catch (error) {
    // Non-blocking — don't let auto-capture failures break the view flow
    reportError(error as Error);
  }
}
