/**
 * Test script for critical LP email notifications.
 *
 * Sends each critical email to a test address using the existing send functions
 * with sample data. This lets you manually verify email rendering and delivery.
 *
 * Usage:
 *   npx tsx scripts/test-emails.ts [test-email@example.com]
 *
 * If no email address is provided, emails are sent to Resend's test inbox
 * (delivered@resend.dev) regardless of NODE_ENV.
 *
 * Requires:
 *   - RESEND_API_KEY environment variable set
 *   - fundroom.ai domain verified in Resend (or using test mode)
 */

import { Resend } from "resend";
import { render } from "@react-email/render";
import { ReactElement } from "react";

// --- Import email templates directly (no DB needed) ---
import InvestorWelcomeEmail from "../components/emails/investor-welcome";
import InvestorApprovedEmail from "../components/emails/investor-approved";
import WireInstructionsEmail from "../components/emails/wire-instructions";
import WireConfirmedEmail from "../components/emails/wire-confirmed";
import DocumentReviewNotification from "../components/emails/document-review-notification";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("ERROR: RESEND_API_KEY environment variable is not set.");
  console.error("Set it in your .env file or export it before running this script.");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const testEmail = process.argv[2] || "delivered@resend.dev";
const FROM = "FundRoom <notifications@fundroom.ai>";

console.log(`\n=== FundRoom Email Test Suite ===`);
console.log(`Sending test emails to: ${testEmail}`);
console.log(`From: ${FROM}\n`);

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE = {
  investorName: "Jane Smith",
  fundName: "Acme Growth Fund I",
  gpFirmName: "Acme Capital Group",
  portalUrl: "https://app.fundroom.ai/lp/dashboard",
  wirePortalUrl: "https://app.fundroom.ai/lp/wire",
  investmentsPortalUrl: "https://app.fundroom.ai/lp/investments",
  docsPortalUrl: "https://app.fundroom.ai/lp/docs",
};

// ---------------------------------------------------------------------------
// Send helper
// ---------------------------------------------------------------------------

async function sendTestEmail(
  name: string,
  subject: string,
  react: ReactElement,
): Promise<boolean> {
  try {
    const html = await render(react);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: testEmail,
      subject: `[TEST] ${subject}`,
      html,
    });

    if (error) {
      console.error(`  FAIL: ${name} — ${error.name}: ${error.message}`);
      return false;
    }

    console.log(`  OK:   ${name} (id: ${data?.id})`);
    return true;
  } catch (err: unknown) {
    console.error(`  FAIL: ${name} — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const results: boolean[] = [];

  // 1. LP Welcome Email
  console.log("\n1. Investor Welcome Email");
  results.push(
    await sendTestEmail(
      "Investor Welcome",
      `Welcome to ${SAMPLE.fundName} — Your investor portal is ready`,
      InvestorWelcomeEmail({
        investorName: SAMPLE.investorName,
        fundName: SAMPLE.fundName,
        gpFirmName: SAMPLE.gpFirmName,
        portalUrl: SAMPLE.portalUrl,
      }),
    ),
  );

  // 2. Investor Approved Email
  console.log("\n2. Investor Approved Email");
  results.push(
    await sendTestEmail(
      "Investor Approved",
      `Your investment in ${SAMPLE.fundName} has been approved`,
      InvestorApprovedEmail({
        investorName: SAMPLE.investorName,
        fundName: SAMPLE.fundName,
        gpFirmName: SAMPLE.gpFirmName,
        nextSteps:
          "Please proceed to your investor portal to review wire transfer instructions and complete your investment.",
        portalUrl: SAMPLE.portalUrl,
      }),
    ),
  );

  // 3. Wire Instructions Email
  console.log("\n3. Wire Instructions Email");
  results.push(
    await sendTestEmail(
      "Wire Instructions",
      `Wire instructions for your ${SAMPLE.fundName} investment`,
      WireInstructionsEmail({
        investorName: SAMPLE.investorName,
        fundName: SAMPLE.fundName,
        commitmentAmount: "$250,000.00",
        bankName: "First National Bank",
        accountName: `${SAMPLE.fundName}, LP`,
        routingNumber: "021000021",
        accountNumber: "1234567890",
        reference: `Investment — ${SAMPLE.investorName}`,
        notes:
          "Please include the reference number in your wire memo. Contact us through the portal with questions.",
        portalUrl: SAMPLE.wirePortalUrl,
      }),
    ),
  );

  // 4. Wire Confirmed Email
  console.log("\n4. Wire Confirmed Email");
  results.push(
    await sendTestEmail(
      "Wire Confirmed",
      `Funds received — ${SAMPLE.fundName}`,
      WireConfirmedEmail({
        fundName: SAMPLE.fundName,
        investorName: SAMPLE.investorName,
        amountReceived: "$250,000.00",
        fundsReceivedDate: "February 12, 2026",
        bankReference: "WR-2026-0212-001",
        confirmationNotes:
          "Funds cleared and verified. Your investment is now fully funded.",
        portalUrl: SAMPLE.investmentsPortalUrl,
      }),
    ),
  );

  // 5. Document Review — Approved
  console.log("\n5. Document Review Email (Approved)");
  results.push(
    await sendTestEmail(
      "Document Approved",
      "Document approved: Accreditation Certificate",
      DocumentReviewNotification({
        investorName: SAMPLE.investorName,
        documentTitle: "Accreditation Certificate",
        documentType: "ACCREDITATION",
        fundName: SAMPLE.fundName,
        reviewStatus: "APPROVED",
        reviewNotes: "Document verified. Accreditation confirmed for 12 months.",
        reviewerName: "Robert Ciesco",
        portalUrl: SAMPLE.docsPortalUrl,
      }),
    ),
  );

  // 6. Document Review — Revision Requested
  console.log("\n6. Document Review Email (Revision Requested)");
  results.push(
    await sendTestEmail(
      "Document Revision Requested",
      "Revision requested: W-9 Tax Form",
      DocumentReviewNotification({
        investorName: SAMPLE.investorName,
        documentTitle: "W-9 Tax Form",
        documentType: "TAX_FORM",
        fundName: SAMPLE.fundName,
        reviewStatus: "REVISION_REQUESTED",
        reviewNotes:
          "The EIN on the form does not match the entity name provided. Please upload a corrected W-9.",
        reviewerName: "Robert Ciesco",
        portalUrl: SAMPLE.docsPortalUrl,
      }),
    ),
  );

  // 7. Document Review — Rejected
  console.log("\n7. Document Review Email (Rejected)");
  results.push(
    await sendTestEmail(
      "Document Rejected",
      "Document not accepted: Identity Verification",
      DocumentReviewNotification({
        investorName: SAMPLE.investorName,
        documentTitle: "Identity Verification",
        documentType: "IDENTITY",
        fundName: SAMPLE.fundName,
        reviewStatus: "REJECTED",
        reviewNotes:
          "Document expired. Please upload a current government-issued ID.",
        reviewerName: "Robert Ciesco",
        portalUrl: SAMPLE.docsPortalUrl,
      }),
    ),
  );

  // Summary
  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`\n=== Results: ${passed}/${total} emails sent successfully ===`);

  if (passed < total) {
    console.error(
      `\nWARNING: ${total - passed} email(s) failed. Check errors above.`,
    );
    process.exit(1);
  }

  console.log("\nAll test emails sent. Check your inbox to verify rendering.");
  console.log(
    `If using delivered@resend.dev, check: https://resend.com/emails\n`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
