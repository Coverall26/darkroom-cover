import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/lp/bank/link-token
 * Creates a Plaid Link token for bank account connection.
 *
 * DISABLED: Plaid is Phase 2. Manual wire transfer is the MVP payment method.
 * Set PLAID_ENABLED=true and provide PLAID_CLIENT_ID + PLAID_SECRET to activate.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Bank linking via Plaid is coming soon. Please use manual wire transfer.",
      phase: "V2",
      configured: false,
    },
    { status: 503 },
  );
}
