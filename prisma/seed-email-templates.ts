/**
 * Seed system email templates for CRM outreach.
 *
 * These 5 system templates are created per-organization during org setup.
 * They use merge variables: {{contact.firstName}}, {{contact.lastName}},
 * {{contact.company}}, {{fund.name}}, {{fund.target}}, {{org.name}},
 * {{dataroom.link}}, {{onboarding.link}}.
 *
 * Usage:
 *   npx ts-node prisma/seed-email-templates.ts [orgId]
 *
 * If no orgId is provided, seeds templates for all organizations that
 * don't already have system templates.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface SystemTemplate {
  name: string;
  category: string;
  subject: string;
  body: string;
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    name: "Dataroom Invitation",
    category: "INVITATION",
    subject: "{{org.name}} — You're invited to view our materials",
    body: `<p>Hi {{contact.firstName}},</p>
<p>You've been invited to review materials from <strong>{{org.name}}</strong>.</p>
<p>Click the link below to access the dataroom:</p>
<p><a href="{{dataroom.link}}">View Dataroom</a></p>
<p>If you have any questions, feel free to reply to this email.</p>
<p>Best regards,<br/>{{org.name}}</p>`,
  },
  {
    name: "Follow-Up After View",
    category: "FOLLOW_UP",
    subject: "Following up on {{fund.name}}",
    body: `<p>Hi {{contact.firstName}},</p>
<p>I noticed you recently viewed our materials for <strong>{{fund.name}}</strong>. I wanted to follow up and see if you have any questions or would like to discuss the opportunity further.</p>
<p>We'd be happy to schedule a call at your convenience.</p>
<p>Best regards,<br/>{{org.name}}</p>`,
  },
  {
    name: "Commitment Thank You",
    category: "COMMITMENT",
    subject: "Thank you for your commitment to {{fund.name}}",
    body: `<p>Hi {{contact.firstName}},</p>
<p>Thank you for your commitment to <strong>{{fund.name}}</strong>. We're excited to have you as an investor.</p>
<p><strong>Next Steps:</strong></p>
<ul>
<li>You'll receive wiring instructions shortly</li>
<li>Please upload your proof of funds at your earliest convenience</li>
<li>Our team will confirm receipt of your wire transfer</li>
</ul>
<p>If you have any questions about the funding process, please don't hesitate to reach out.</p>
<p>Best regards,<br/>{{org.name}}</p>`,
  },
  {
    name: "Wire Instructions",
    category: "WIRE",
    subject: "{{fund.name}} — Funding Instructions",
    body: `<p>Hi {{contact.firstName}},</p>
<p>Please find below the wiring instructions for your commitment to <strong>{{fund.name}}</strong>.</p>
<p>Once you've completed the wire transfer, please upload your proof of payment through the investor portal:</p>
<p><a href="{{onboarding.link}}">Upload Proof of Payment</a></p>
<p>Our team will confirm receipt of your funds and update your investment status.</p>
<p>Best regards,<br/>{{org.name}}</p>`,
  },
  {
    name: "General Update",
    category: "UPDATE",
    subject: "{{fund.name}} — Update from {{org.name}}",
    body: `<p>Hi {{contact.firstName}},</p>
<p>We wanted to share an update regarding <strong>{{fund.name}}</strong>.</p>
<p>[Your update here]</p>
<p>As always, please don't hesitate to reach out if you have any questions.</p>
<p>Best regards,<br/>{{org.name}}</p>`,
  },
];

/**
 * Seeds system email templates for a given organization.
 * Skips if system templates already exist for this org.
 */
export async function seedEmailTemplatesForOrg(orgId: string): Promise<number> {
  // Check if system templates already exist
  const existing = await prisma.emailTemplate.count({
    where: { orgId, isSystem: true },
  });

  if (existing > 0) {
    return 0; // Already seeded
  }

  const templates = SYSTEM_TEMPLATES.map((t) => ({
    orgId,
    name: t.name,
    subject: t.subject,
    body: t.body,
    isSystem: true,
    category: t.category,
  }));

  const result = await prisma.emailTemplate.createMany({ data: templates });
  return result.count;
}

async function main() {
  const targetOrgId = process.argv[2];

  if (targetOrgId) {
    const count = await seedEmailTemplatesForOrg(targetOrgId);
    console.log(`Seeded ${count} email templates for org ${targetOrgId}`);
  } else {
    // Seed for all organizations that don't have system templates
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    let totalSeeded = 0;
    for (const org of orgs) {
      const count = await seedEmailTemplatesForOrg(org.id);
      if (count > 0) {
        console.log(`Seeded ${count} templates for ${org.name} (${org.id})`);
        totalSeeded += count;
      }
    }

    console.log(`\nTotal: seeded ${totalSeeded} templates across ${orgs.length} organizations`);
  }
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
