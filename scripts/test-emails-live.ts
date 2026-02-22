/**
 * LIVE Email Integration Test Script
 *
 * Tests ALL critical email templates via the Resend API with real sends.
 * Covers LP-facing, GP-facing, system, and e-signature email types.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx npx tsx scripts/test-emails-live.ts [test@yourdomain.com]
 *
 * If no email address is provided, sends to Resend's test inbox (delivered@resend.dev).
 *
 * Requires:
 *   - RESEND_API_KEY environment variable
 *   - fundroom.ai domain verified in Resend (or using Resend test mode)
 */

import { Resend } from "resend";
import { render } from "@react-email/render";
import { ReactElement } from "react";

// --- Import email templates directly (no DB dependencies) ---

// LP-facing emails
import InvestorWelcomeEmail from "../components/emails/investor-welcome";
import InvestorApprovedEmail from "../components/emails/investor-approved";
import WireInstructionsEmail from "../components/emails/wire-instructions";
import WireConfirmedEmail from "../components/emails/wire-confirmed";
import DocumentReviewNotification from "../components/emails/document-review-notification";
import ProofReceivedEmail from "../components/emails/proof-received";
import ProofVerifiedEmail from "../components/emails/proof-verified";
import ProofRejectedEmail from "../components/emails/proof-rejected";
import AccreditationConfirmedEmail from "../components/emails/accreditation-confirmed";

// E-signature emails
import SignatureRequestEmail from "../components/emails/signature-request";
import SignatureCompletedEmail from "../components/emails/signature-completed";
import SignatureReminderEmail from "../components/emails/signature-reminder";

// System / GP emails
import AdminLoginLinkEmail from "../components/emails/admin-login-link";
import TeamInvitation from "../components/emails/team-invitation";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("ERROR: RESEND_API_KEY environment variable is not set.");
  console.error(
    "Usage: RESEND_API_KEY=re_xxx npx tsx scripts/test-emails-live.ts [email]",
  );
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const testEmail = process.argv[2] || "delivered@resend.dev";
const FROM = "FundRoom <notifications@fundroom.ai>";

console.log(`\n${"=".repeat(60)}`);
console.log("  FundRoom LIVE Email Integration Test");
console.log(`${"=".repeat(60)}`);
console.log(`  To:   ${testEmail}`);
console.log(`  From: ${FROM}`);
console.log(`  API:  ${RESEND_API_KEY.substring(0, 8)}...`);
console.log(`${"=".repeat(60)}\n`);

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE = {
  investorName: "Jane Smith",
  fundName: "Acme Growth Fund I",
  gpFirmName: "Acme Capital Group",
  teamName: "Acme Capital Group",
  portalUrl: "https://app.fundroom.ai/lp/dashboard",
  wirePortalUrl: "https://app.fundroom.ai/lp/wire",
  investmentsPortalUrl: "https://app.fundroom.ai/lp/investments",
  docsPortalUrl: "https://app.fundroom.ai/lp/docs",
  dashboardUrl: "https://app.fundroom.ai/admin/wire-transfers",
  signingUrl: "https://app.fundroom.ai/view/sign/test-token-123",
  adminLoginUrl: "https://app.fundroom.ai/admin/login?token=test-token-abc",
  teamInviteUrl: "https://app.fundroom.ai/invite/test-team-xyz",
};

// ---------------------------------------------------------------------------
// Send helper
// ---------------------------------------------------------------------------

async function sendTestEmail(
  index: number,
  name: string,
  subject: string,
  react: ReactElement,
): Promise<boolean> {
  try {
    const html = await render(react);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: testEmail,
      subject: `[TEST ${index}] ${subject}`,
      html,
    });

    if (error) {
      console.error(
        `  FAIL: ${name} — ${error.name}: ${error.message}`,
      );
      return false;
    }

    console.log(`  OK:   ${name} (id: ${data?.id})`);
    return true;
  } catch (err: unknown) {
    console.error(
      `  FAIL: ${name} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main — test all email types
// ---------------------------------------------------------------------------

async function main() {
  const results: { name: string; category: string; passed: boolean }[] = [];
  let idx = 0;

  // =========================================================================
  // CATEGORY A: LP-Facing Emails
  // =========================================================================

  console.log("─── Category A: LP-Facing Emails ───\n");

  // 1. Investor Welcome
  idx++;
  console.log(`${idx}. Investor Welcome Email`);
  results.push({
    name: "Investor Welcome",
    category: "LP",
    passed: await sendTestEmail(
      idx,
      "Investor Welcome",
      `Welcome to ${SAMPLE.fundName} — Your investor portal is ready`,
      InvestorWelcomeEmail({
        investorName: SAMPLE.investorName,
        fundName: SAMPLE.fundName,
        gpFirmName: SAMPLE.gpFirmName,
        portalUrl: SAMPLE.portalUrl,
      }),
    ),
  });

  // 2. Investor Approved
  idx++;
  console.log(`\n${idx}. Investor Approved Email`);
  results.push({
    name: "Investor Approved",
    category: "LP",
    passed: await sendTestEmail(
      idx,
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
  });

  // 3. Wire Instructions
  idx++;
  console.log(`\n${idx}. Wire Instructions Email`);
  results.push({
    name: "Wire Instructions",
    category: "LP",
    passed: await sendTestEmail(
      idx,
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
  });

  // 4. Wire Confirmed
  idx++;
  console.log(`\n${idx}. Wire Confirmed Email`);
  results.push({
    name: "Wire Confirmed",
    category: "LP",
    passed: await sendTestEmail(
      idx,
      "Wire Confirmed",
      `Funds received — ${SAMPLE.fundName}`,
      WireConfirmedEmail({
        fundName: SAMPLE.fundName,
        investorName: SAMPLE.investorName,
        amountReceived: "$250,000.00",
        fundsReceivedDate: "February 13, 2026",
        bankReference: "WR-2026-0213-001",
        confirmationNotes:
          "Funds cleared and verified. Your investment is now fully funded.",
        portalUrl: SAMPLE.investmentsPortalUrl,
      }),
    ),
  });

  // 5. Document Review — Approved
  idx++;
  console.log(`\n${idx}. Document Review Email (Approved)`);
  results.push({
    name: "Document Approved",
    category: "LP",
    passed: await sendTestEmail(
      idx,
      "Document Approved",
      "Document approved: Accreditation Certificate",
      DocumentReviewNotification({
        investorName: SAMPLE.investorName,
        documentTitle: "Accreditation Certificate",
        documentType: "ACCREDITATION",
        fundName: SAMPLE.fundName,
        reviewStatus: "APPROVED",
        reviewNotes:
          "Document verified. Accreditation confirmed for 12 months.",
        reviewerName: "Robert Ciesco",
        portalUrl: SAMPLE.docsPortalUrl,
      }),
    ),
  });

  // 6. Document Review — Revision Requested
  idx++;
  console.log(`\n${idx}. Document Review Email (Revision Requested)`);
  results.push({
    name: "Document Revision Requested",
    category: "LP",
    passed: await sendTestEmail(
      idx,
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
  });

  // 7. Document Review — Rejected
  idx++;
  console.log(`\n${idx}. Document Review Email (Rejected)`);
  results.push({
    name: "Document Rejected",
    category: "LP",
    passed: await sendTestEmail(
      idx,
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
  });

  // 8. Proof Verified
  idx++;
  console.log(`\n${idx}. Wire Proof Verified Email`);
  results.push({
    name: "Proof Verified",
    category: "LP",
    passed: await sendTestEmail(
      idx,
      "Proof Verified",
      `Wire transfer verified — ${SAMPLE.fundName}`,
      ProofVerifiedEmail({
        fundName: SAMPLE.fundName,
        investorName: SAMPLE.investorName,
        commitmentAmount: "$250,000.00",
        verifiedAt: "February 13, 2026",
        portalUrl: SAMPLE.investmentsPortalUrl,
      }),
    ),
  });

  // 9. Proof Rejected
  idx++;
  console.log(`\n${idx}. Wire Proof Rejected Email`);
  results.push({
    name: "Proof Rejected",
    category: "LP",
    passed: await sendTestEmail(
      idx,
      "Proof Rejected",
      `Wire proof requires resubmission — ${SAMPLE.fundName}`,
      ProofRejectedEmail({
        fundName: SAMPLE.fundName,
        investorName: SAMPLE.investorName,
        commitmentAmount: "$250,000.00",
        rejectionReason:
          "Wire transfer receipt is illegible. Please upload a clearer copy.",
        rejectedAt: "February 13, 2026",
        portalUrl: SAMPLE.investmentsPortalUrl,
      }),
    ),
  });

  // 10. Accreditation Confirmed
  idx++;
  console.log(`\n${idx}. Accreditation Confirmed Email`);
  results.push({
    name: "Accreditation Confirmed",
    category: "LP",
    passed: await sendTestEmail(
      idx,
      "Accreditation Confirmed",
      "Your accreditation has been confirmed",
      AccreditationConfirmedEmail({
        investorName: SAMPLE.investorName,
        email: testEmail,
        accreditationType: "INCOME",
        completedAt: new Date().toISOString(),
      }),
    ),
  });

  // =========================================================================
  // CATEGORY B: GP-Facing Emails
  // =========================================================================

  console.log("\n─── Category B: GP-Facing Emails ───\n");

  // 11. Proof Received (sent to GP)
  idx++;
  console.log(`${idx}. Wire Proof Received Email (GP)`);
  results.push({
    name: "Proof Received (GP)",
    category: "GP",
    passed: await sendTestEmail(
      idx,
      "Proof Received (GP)",
      `Wire proof received from ${SAMPLE.investorName} — ${SAMPLE.fundName}`,
      ProofReceivedEmail({
        fundName: SAMPLE.fundName,
        investorName: SAMPLE.investorName,
        commitmentAmount: "$250,000.00",
        proofFileName: "wire_receipt_feb2026.pdf",
        uploadedAt: "February 13, 2026",
        proofNotes: "Wire sent from Chase Business account ending in 4567.",
        dashboardUrl: SAMPLE.dashboardUrl,
      }),
    ),
  });

  // =========================================================================
  // CATEGORY C: E-Signature Emails
  // =========================================================================

  console.log("\n─── Category C: E-Signature Emails ───\n");

  // 12. Signature Request
  idx++;
  console.log(`${idx}. Signature Request Email`);
  results.push({
    name: "Signature Request",
    category: "E-Sign",
    passed: await sendTestEmail(
      idx,
      "Signature Request",
      `${SAMPLE.gpFirmName} has requested your signature on "Subscription Agreement"`,
      SignatureRequestEmail({
        recipientName: SAMPLE.investorName,
        documentTitle: "Subscription Agreement — Acme Growth Fund I",
        senderName: "Robert Ciesco",
        teamName: SAMPLE.teamName,
        message:
          "Please review and sign the subscription agreement at your earliest convenience.",
        signingUrl: SAMPLE.signingUrl,
      }),
    ),
  });

  // 13. Signature Completed
  idx++;
  console.log(`\n${idx}. Signature Completed Email`);
  results.push({
    name: "Signature Completed",
    category: "E-Sign",
    passed: await sendTestEmail(
      idx,
      "Signature Completed",
      `"Subscription Agreement" has been signed by all parties`,
      SignatureCompletedEmail({
        recipientName: SAMPLE.investorName,
        documentTitle: "Subscription Agreement — Acme Growth Fund I",
        teamName: SAMPLE.teamName,
        completedAt: "February 13, 2026 at 2:30 PM EST",
        signersList: [
          "Jane Smith (Investor)",
          "Robert Ciesco (GP — Acme Capital Group)",
        ],
        documentUrl: SAMPLE.docsPortalUrl,
      }),
    ),
  });

  // 14. Signature Reminder
  idx++;
  console.log(`\n${idx}. Signature Reminder Email`);
  results.push({
    name: "Signature Reminder",
    category: "E-Sign",
    passed: await sendTestEmail(
      idx,
      "Signature Reminder",
      `Reminder: "${SAMPLE.fundName} NDA" awaiting your signature`,
      SignatureReminderEmail({
        recipientName: SAMPLE.investorName,
        documentTitle: `${SAMPLE.fundName} NDA`,
        senderName: "Robert Ciesco",
        teamName: SAMPLE.teamName,
        signingUrl: SAMPLE.signingUrl,
      }),
    ),
  });

  // =========================================================================
  // CATEGORY D: System / Platform Emails
  // =========================================================================

  console.log("\n─── Category D: System / Platform Emails ───\n");

  // 15. Admin Login Link
  idx++;
  console.log(`${idx}. Admin Login Link Email`);
  results.push({
    name: "Admin Login Link",
    category: "System",
    passed: await sendTestEmail(
      idx,
      "Admin Login Link",
      "Admin login link for FundRoom",
      AdminLoginLinkEmail({
        url: SAMPLE.adminLoginUrl,
      }),
    ),
  });

  // 16. Team Invitation
  idx++;
  console.log(`\n${idx}. Team Invitation Email`);
  results.push({
    name: "Team Invitation",
    category: "System",
    passed: await sendTestEmail(
      idx,
      "Team Invitation",
      `Join ${SAMPLE.teamName} on FundRoom`,
      TeamInvitation({
        senderName: "Robert Ciesco",
        senderEmail: "rciesco@acmecapital.com",
        teamName: SAMPLE.teamName,
        url: SAMPLE.teamInviteUrl,
      }),
    ),
  });

  // =========================================================================
  // Summary
  // =========================================================================

  console.log(`\n${"=".repeat(60)}`);
  console.log("  RESULTS SUMMARY");
  console.log(`${"=".repeat(60)}\n`);

  const categories = ["LP", "GP", "E-Sign", "System"];

  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const passed = catResults.filter((r) => r.passed).length;
    const total = catResults.length;
    const status = passed === total ? "ALL PASS" : `${total - passed} FAILED`;
    console.log(
      `  ${cat.padEnd(8)} ${passed}/${total}  ${status}`,
    );

    for (const r of catResults) {
      console.log(`    ${r.passed ? "✓" : "✗"} ${r.name}`);
    }
    console.log();
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  console.log(`${"=".repeat(60)}`);
  console.log(
    `  TOTAL: ${totalPassed}/${totalCount} emails sent successfully`,
  );
  console.log(`${"=".repeat(60)}\n`);

  if (totalPassed < totalCount) {
    console.error(
      `WARNING: ${totalCount - totalPassed} email(s) failed. Check errors above.\n`,
    );
    process.exit(1);
  }

  console.log("All test emails sent. Check your inbox to verify rendering.");
  if (testEmail === "delivered@resend.dev") {
    console.log("Using Resend test inbox — check: https://resend.com/emails");
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
