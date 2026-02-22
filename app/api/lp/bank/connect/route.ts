import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/lp/bank/connect
 * Exchanges Plaid public token and stores bank link.
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
    },
    { status: 503 },
  );
}
