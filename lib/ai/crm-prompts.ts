/**
 * AI CRM Prompt Templates — System prompts and prompt builders for the AI CRM engine.
 *
 * These functions construct prompts for LLM calls (via a provider adapter pattern).
 * The actual LLM call is made by the caller — this file is pure prompt construction.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactContext {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  company?: string | null;
  title?: string | null;
  status: string;
  engagementScore: number;
  lastContactedAt?: string | null;
  lastEngagedAt?: string | null;
  recentActivities?: Array<{
    type: string;
    description: string;
    createdAt: string;
  }>;
}

export interface SenderContext {
  name?: string | null;
  company?: string | null;
  fundName?: string | null;
}

// ---------------------------------------------------------------------------
// Email draft prompts
// ---------------------------------------------------------------------------

export type EmailPurpose =
  | "follow_up"
  | "introduction"
  | "commitment_check"
  | "thank_you"
  | "update"
  | "re_engagement";

const PURPOSE_INSTRUCTIONS: Record<EmailPurpose, string> = {
  follow_up:
    "Write a professional follow-up email. Reference any recent engagement or past conversations. Keep it warm and focused.",
  introduction:
    "Write a professional introduction email for a potential investor. Be informative but not pushy. Highlight the value proposition briefly.",
  commitment_check:
    "Write a gentle email checking on their investment commitment status. Be professional and supportive, not pressuring.",
  thank_you:
    "Write a sincere thank-you email. Reference specific actions they've taken (viewing documents, committing, etc.).",
  update:
    "Write a brief fund/company update email. Keep it concise and professional. Include key metrics or milestones.",
  re_engagement:
    "Write a re-engagement email for a contact who hasn't been active. Be friendly, reference past interest, and provide a reason to reconnect.",
};

export function buildEmailDraftPrompt(
  contact: ContactContext,
  sender: SenderContext,
  purpose: EmailPurpose,
  additionalContext?: string,
): string {
  const contactName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ") || contact.email;

  const recentActivity = contact.recentActivities
    ?.slice(0, 5)
    .map((a) => `- ${a.type}: ${a.description} (${a.createdAt})`)
    .join("\n") ?? "No recent activity tracked.";

  return `You are a professional fundraising and investor relations assistant for ${sender.company ?? "a fund management firm"}.

TASK: Draft an email from ${sender.name ?? "the fund manager"} to ${contactName}.

CONTACT DETAILS:
- Name: ${contactName}
- Email: ${contact.email}
- Company: ${contact.company ?? "Unknown"}
- Title: ${contact.title ?? "Unknown"}
- CRM Status: ${contact.status}
- Engagement Score: ${contact.engagementScore}/100
- Last Contacted: ${contact.lastContactedAt ?? "Never"}
- Last Engaged: ${contact.lastEngagedAt ?? "Never"}

RECENT ACTIVITY:
${recentActivity}

SENDER:
- Name: ${sender.name ?? "Fund Manager"}
- Company: ${sender.company ?? "Investment Firm"}
${sender.fundName ? `- Fund: ${sender.fundName}` : ""}

PURPOSE: ${PURPOSE_INSTRUCTIONS[purpose]}

${additionalContext ? `ADDITIONAL CONTEXT: ${additionalContext}` : ""}

REQUIREMENTS:
1. Output ONLY a JSON object with "subject" and "body" fields.
2. The body should be plain text (no HTML tags).
3. Keep the email concise (3-5 paragraphs max).
4. Use a professional but warm tone appropriate for investor relations.
5. Include a clear call-to-action.
6. Do NOT include placeholder brackets like [your name] — use the actual sender name.
7. Do NOT mention AI or that this email was drafted by AI.

OUTPUT FORMAT:
{"subject": "Your subject line", "body": "Your email body text"}`;
}

// ---------------------------------------------------------------------------
// Insight card prompts
// ---------------------------------------------------------------------------

export function buildInsightPrompt(
  contacts: ContactContext[],
  senderCompany: string,
): string {
  const contactSummaries = contacts
    .slice(0, 20) // Limit to keep prompt size reasonable
    .map(
      (c) =>
        `- ${c.firstName ?? ""} ${c.lastName ?? ""} (${c.email}): ${c.status}, Score: ${c.engagementScore}, Last Engaged: ${c.lastEngagedAt ?? "Never"}`,
    )
    .join("\n");

  return `You are an AI assistant for ${senderCompany}, a fund management platform.

Analyze the following CRM contacts and provide actionable insights.

CONTACTS:
${contactSummaries}

Provide exactly 3 insight cards in JSON format. Each card should have:
- "title": Short headline (max 60 chars)
- "description": Brief actionable insight (max 200 chars)
- "type": One of "opportunity", "risk", "action", "trend"
- "priority": "high", "medium", or "low"
- "contactIds": Array of relevant contact emails (not IDs)

OUTPUT FORMAT:
[{"title": "...", "description": "...", "type": "...", "priority": "...", "contactIds": ["..."]}]

Focus on:
1. Contacts that need immediate follow-up (high engagement but no recent contact)
2. At-risk contacts (declining engagement or long silence)
3. Patterns in the pipeline (common stages, conversion opportunities)`;
}

// ---------------------------------------------------------------------------
// Per-contact insight prompt
// ---------------------------------------------------------------------------

export function buildContactInsightPrompt(
  contact: ContactContext,
  senderCompany: string,
): string {
  const contactName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ") || contact.email;

  const recentActivity = contact.recentActivities
    ?.slice(0, 10)
    .map((a) => `- ${a.type}: ${a.description} (${a.createdAt})`)
    .join("\n") ?? "No recent activity tracked.";

  return `You are an AI assistant for ${senderCompany}, a fund management platform.

Analyze this specific CRM contact and provide a single actionable insight.

CONTACT:
- Name: ${contactName}
- Email: ${contact.email}
- Company: ${contact.company ?? "Unknown"}
- Title: ${contact.title ?? "Unknown"}
- CRM Status: ${contact.status}
- Engagement Score: ${contact.engagementScore}/100
- Last Contacted: ${contact.lastContactedAt ?? "Never"}
- Last Engaged: ${contact.lastEngagedAt ?? "Never"}

RECENT ACTIVITY:
${recentActivity}

Provide exactly 1 insight card in JSON format:
- "title": Short headline (max 60 chars)
- "description": Brief actionable insight (max 200 chars)
- "type": One of "opportunity", "risk", "action", "trend"
- "priority": "high", "medium", or "low"
- "contactIds": ["${contact.email}"]

OUTPUT FORMAT:
{"insights": [{"title": "...", "description": "...", "type": "...", "priority": "...", "contactIds": ["${contact.email}"]}]}

Focus on the most important action the fund manager should take with this contact right now.`;
}

// ---------------------------------------------------------------------------
// Daily digest prompt
// ---------------------------------------------------------------------------

export function buildDigestPrompt(
  stats: {
    totalContacts: number;
    newContacts24h: number;
    emailsSent24h: number;
    emailsOpened24h: number;
    overdueFollowUps: number;
    hotLeads: number;
    recentActivities: Array<{ type: string; description: string }>;
  },
  senderName: string,
  companyName: string,
): string {
  const activities = stats.recentActivities
    .slice(0, 10)
    .map((a) => `- ${a.type}: ${a.description}`)
    .join("\n");

  return `You are an AI CRM assistant for ${companyName}.

Generate a brief daily CRM digest summary for ${senderName}.

TODAY'S METRICS:
- Total Contacts: ${stats.totalContacts}
- New Contacts (24h): ${stats.newContacts24h}
- Emails Sent (24h): ${stats.emailsSent24h}
- Emails Opened (24h): ${stats.emailsOpened24h}
- Overdue Follow-ups: ${stats.overdueFollowUps}
- Hot Leads (score ≥15): ${stats.hotLeads}

RECENT ACTIVITY:
${activities || "No activity in the last 24 hours."}

Write a concise daily digest (3-5 bullet points) highlighting:
1. Key metrics and trends
2. Top priority actions for today
3. Any concerning patterns

Output plain text, no markdown or HTML. Keep it under 500 characters total.`;
}
