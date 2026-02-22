import { Resend } from "resend";

type DomainRegion = 'us-east-1' | 'eu-west-1' | 'sa-east-1' | 'ap-northeast-1';

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DnsRecord {
  type: string; // "MX" | "TXT" | "CNAME"
  name: string;
  value: string;
  priority?: number;
  ttl?: string;
}

export interface DomainStatus {
  id: string;
  name: string;
  status: "not_started" | "pending" | "verified" | "failed" | "temporary_failure";
  region: string;
  dnsRecords: DnsRecord[];
  createdAt: string;
}

export interface CreateDomainResult {
  domainId: string;
  domain: string;
  status: string;
  region: string;
  dnsRecords: DnsRecord[];
}

// ---------------------------------------------------------------------------
// Resend client (reuses the platform API key)
// ---------------------------------------------------------------------------

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  return new Resend(apiKey);
}

// ---------------------------------------------------------------------------
// Domain CRUD via Resend API
// ---------------------------------------------------------------------------

/**
 * Add a new sending domain to the FundRoom Resend account.
 * Returns the DNS records the org needs to configure.
 */
export async function createEmailDomain(
  teamId: string,
  domain: string,
  region: DomainRegion = "us-east-1",
): Promise<CreateDomainResult> {
  const resend = getResendClient();

  // Check if team already has a domain configured
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { emailDomainId: true, emailDomain: true },
  });

  if (team?.emailDomainId) {
    throw new Error(
      `Team already has a domain configured: ${team.emailDomain}. Remove it first.`,
    );
  }

  // Create domain in Resend
  const { data, error } = await resend.domains.create({ name: domain, region });

  if (error) {
    console.error("[EMAIL_DOMAIN] Resend create domain error:", error);
    throw new Error(`Failed to create domain: ${error.message}`);
  }

  if (!data) {
    throw new Error("Resend returned no data when creating domain");
  }

  // Normalize DNS records from Resend response
  const dnsRecords: DnsRecord[] = (data.records || []).map((r: any) => ({
    type: r.type || r.record_type,
    name: r.name || r.host,
    value: r.value || r.data,
    priority: r.priority,
    ttl: r.ttl,
  }));

  // Save to database
  await prisma.team.update({
    where: { id: teamId },
    data: {
      emailDomainId: data.id,
      emailDomain: domain,
      emailDomainStatus: data.status || "not_started",
      emailDomainRegion: region,
      emailDomainDnsRecords: dnsRecords as any,
    },
  });

  return {
    domainId: data.id,
    domain,
    status: data.status || "not_started",
    region,
    dnsRecords,
  };
}

/**
 * Trigger domain verification in Resend.
 * Call this after the org has added DNS records.
 */
export async function verifyEmailDomain(teamId: string): Promise<DomainStatus> {
  const resend = getResendClient();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { emailDomainId: true, emailDomain: true },
  });

  if (!team?.emailDomainId) {
    throw new Error("No email domain configured for this team");
  }

  // Trigger verification
  const { data, error } = await resend.domains.verify(team.emailDomainId);

  if (error) {
    console.error("[EMAIL_DOMAIN] Resend verify error:", error);
    throw new Error(`Failed to verify domain: ${error.message}`);
  }

  // Fetch updated status
  return getEmailDomainStatus(teamId);
}

/**
 * Get current domain status from Resend.
 * Also syncs status back to our database.
 */
export async function getEmailDomainStatus(teamId: string): Promise<DomainStatus> {
  const resend = getResendClient();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      emailDomainId: true,
      emailDomain: true,
      emailDomainStatus: true,
      emailDomainDnsRecords: true,
    },
  });

  if (!team?.emailDomainId) {
    throw new Error("No email domain configured for this team");
  }

  // Fetch from Resend
  const { data, error } = await resend.domains.get(team.emailDomainId);

  if (error) {
    console.error("[EMAIL_DOMAIN] Resend get domain error:", error);
    throw new Error(`Failed to get domain status: ${error.message}`);
  }

  if (!data) {
    throw new Error("Resend returned no data for domain");
  }

  const status = (data.status || "not_started") as DomainStatus["status"];

  // Normalize DNS records
  const dnsRecords: DnsRecord[] = (data.records || []).map((r: any) => ({
    type: r.type || r.record_type,
    name: r.name || r.host,
    value: r.value || r.data,
    priority: r.priority,
    ttl: r.ttl,
  }));

  // Sync status to database
  const updateData: Record<string, any> = {
    emailDomainStatus: status,
    emailDomainDnsRecords: dnsRecords as any,
  };

  // Mark verified timestamp
  if (status === "verified" && !team.emailDomainStatus?.includes("verified")) {
    updateData.emailDomainVerifiedAt = new Date();
  }

  await prisma.team.update({
    where: { id: teamId },
    data: updateData,
  });

  return {
    id: team.emailDomainId,
    name: team.emailDomain!,
    status,
    region: "us-east-1",
    dnsRecords,
    createdAt: "",
  };
}

/**
 * Remove the email domain from Resend and clear team config.
 */
export async function removeEmailDomain(teamId: string): Promise<void> {
  const resend = getResendClient();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { emailDomainId: true },
  });

  if (!team?.emailDomainId) {
    throw new Error("No email domain configured for this team");
  }

  // Delete from Resend
  try {
    await resend.domains.remove(team.emailDomainId);
  } catch (e) {
    console.error("[EMAIL_DOMAIN] Resend remove error (continuing):", e);
    // Continue to clear DB even if Resend delete fails
  }

  // Clear from database
  await prisma.team.update({
    where: { id: teamId },
    data: {
      emailDomainId: null,
      emailDomain: null,
      emailDomainStatus: null,
      emailDomainRegion: null,
      emailFromName: null,
      emailFromAddress: null,
      emailReplyTo: null,
      emailDomainVerifiedAt: null,
      emailDomainDnsRecords: undefined,
    },
  });
}

/**
 * Update the "from" name, address, and reply-to for an org's email domain.
 */
export async function updateEmailFromSettings(
  teamId: string,
  settings: {
    fromName?: string;
    fromAddress?: string;
    replyTo?: string;
  },
): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { emailDomain: true, emailDomainStatus: true },
  });

  if (!team?.emailDomain) {
    throw new Error("No email domain configured for this team");
  }

  await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(settings.fromName !== undefined && { emailFromName: settings.fromName }),
      ...(settings.fromAddress !== undefined && { emailFromAddress: settings.fromAddress }),
      ...(settings.replyTo !== undefined && { emailReplyTo: settings.replyTo }),
    },
  });
}

// ---------------------------------------------------------------------------
// Email address resolution (used by the sending layer)
// ---------------------------------------------------------------------------

/**
 * Get the "from" address for a team's outbound org-branded emails.
 * Returns null if the team hasn't set up a custom email domain (use platform default).
 */
export async function getTeamFromAddress(
  teamId: string,
): Promise<{ from: string; replyTo?: string } | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      name: true,
      emailDomain: true,
      emailDomainStatus: true,
      emailFromName: true,
      emailFromAddress: true,
      emailReplyTo: true,
    },
  });

  if (!team?.emailDomain || team.emailDomainStatus !== "verified") {
    return null;
  }

  const displayName = team.emailFromName || team.name;
  const localPart = team.emailFromAddress || "notifications";
  const from = `${displayName} <${localPart}@${team.emailDomain}>`;

  return {
    from,
    replyTo: team.emailReplyTo || undefined,
  };
}
