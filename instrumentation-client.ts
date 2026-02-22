import { initBotId } from "botid/client/core";

/**
 * Vercel Bot ID — Client-side initialization
 *
 * Declares which routes require bot classification. The BotID client
 * automatically attaches classification headers to fetch requests
 * targeting these paths. Server-side handlers call checkBotId() to
 * read the verdict.
 *
 * Route categories:
 *   1. Auth (login, signup, magic-link verification)
 *   2. Billing / Payments (Stripe, Plaid ACH)
 *   3. KYC / Accreditation (Persona, investor verification)
 *   4. Document mutations (upload, create, send-for-signature)
 *   5. Marketplace / Deals (create, stage transitions, interest)
 *   6. Team management (invites, role changes)
 *   7. LP actions (subscribe, bank connect)
 */
initBotId({
  protect: [
    // ── Auth ──────────────────────────────────────────────────────
    { path: "/api/auth/*", method: "POST" },
    { path: "/api/view/verify-magic-link", method: "POST" },
    { path: "/api/view/auto-verify-session", method: "POST" },
    { path: "/api/lp/register", method: "POST" },

    // ── Billing / Payments ────────────────────────────────────────
    { path: "/api/teams/*/billing/upgrade", method: "POST" },
    { path: "/api/teams/*/billing/cancel", method: "POST" },
    { path: "/api/teams/*/billing/pause", method: "POST" },
    { path: "/api/teams/*/billing/unpause", method: "POST" },
    { path: "/api/teams/*/billing/reactivate", method: "POST" },
    { path: "/api/teams/*/billing/plan", method: "POST" },
    { path: "/api/teams/*/billing/manage", method: "POST" },
    { path: "/api/lp/subscription/process-payment", method: "POST" },
    { path: "/api/lp/bank/link-token", method: "POST" },
    { path: "/api/lp/bank/connect", method: "POST" },

    // ── KYC / Accreditation ───────────────────────────────────────
    { path: "/api/lp/kyc", method: "POST" },
    { path: "/api/lp/accreditation", method: "POST" },
    { path: "/api/lp/complete-gate", method: "POST" },

    // ── Documents ─────────────────────────────────────────────────
    { path: "/api/teams/*/documents", method: "POST" },
    { path: "/api/lp/documents/upload", method: "POST" },
    { path: "/api/teams/*/signature-documents", method: "POST" },
    { path: "/api/teams/*/signature-documents/*/send", method: "POST" },

    // ── Marketplace / Deals ───────────────────────────────────────
    { path: "/api/teams/*/marketplace/deals", method: "POST" },
    { path: "/api/teams/*/marketplace/deals/*", method: "PATCH" },
    { path: "/api/teams/*/marketplace/deals/*", method: "DELETE" },
    { path: "/api/teams/*/marketplace/deals/*/stage", method: "POST" },
    { path: "/api/teams/*/marketplace/deals/*/interest", method: "POST" },
    { path: "/api/teams/*/marketplace/deals/*/interest", method: "PATCH" },
    { path: "/api/teams/*/marketplace/deals/*/allocations", method: "POST" },
    { path: "/api/teams/*/marketplace/deals/*/allocations", method: "PATCH" },
    { path: "/api/teams/*/marketplace/deals/*/documents", method: "POST" },
    { path: "/api/teams/*/marketplace/deals/*/notes", method: "POST" },
    { path: "/api/teams/*/marketplace/deals/*/listing", method: "POST" },
    { path: "/api/teams/*/marketplace/deals/*/listing", method: "PATCH" },
    { path: "/api/marketplace/listings/*", method: "POST" },

    // ── Team Management ───────────────────────────────────────────
    { path: "/api/teams/*/invite", method: "POST" },
    { path: "/api/teams/*/change-role", method: "POST" },

    // ── LP Actions ────────────────────────────────────────────────
    { path: "/api/lp/subscribe", method: "POST" },
    { path: "/api/lp/wire-instructions", method: "POST" },
  ],
});
