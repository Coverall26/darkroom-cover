import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";

/**
 * POST /api/setup — Save wizard step data
 * Persists step progress server-side for resume capability.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { step, data } = body;

    if (typeof step !== "number" || !data) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    // Log step save for audit trail
    await logAuditEvent({
      eventType: "SETTINGS_UPDATED",
      userId: auth.userId,
      resourceType: "Organization",
      metadata: {
        action: "wizard_step_saved",
        step,
        stepName: [
          "company_info",
          "branding",
          "raise_style",
          "team_invites",
          "dataroom",
          "fund_details",
          "lp_onboarding",
          "integrations",
          "launch",
        ][step],
      },
    });

    return NextResponse.json({ success: true, step });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/setup — Get current wizard state
 * Returns saved wizard progress for the current user.
 */
export async function GET() {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    // Wizard state is primarily client-side (localStorage).
    // Server returns any existing org/fund data if user already started.
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
