/**
 * withTierCheck — App Router middleware wrapper for CRM tier enforcement.
 *
 * Wraps an API route handler to enforce tier limits before the handler runs.
 * Returns 403 with structured error if any limit or feature is blocked.
 *
 * Usage:
 *   export const POST = withTierCheck(
 *     async (req, context, tier) => { ... },
 *     { requiredFeature: 'kanban', checkContactLimit: true }
 *   );
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { resolveOrgTier, CrmTierLimits } from "./crm-tier";
import {
  checkContactLimit,
  checkEsigLimit,
  checkFeatureAccess,
} from "./gates";

interface TierCheckOptions {
  requiredFeature?: string;
  checkContactLimit?: boolean;
  checkEsigLimit?: boolean;
}

type HandlerFn = (
  req: NextRequest,
  context: { params?: Record<string, string> },
  tier: CrmTierLimits,
) => Promise<NextResponse>;

/**
 * Wraps a handler with tier checks. Verifies session, resolves org tier,
 * and runs specified limit checks before invoking the handler.
 */
export function withTierCheck(handler: HandlerFn, options?: TierCheckOptions) {
  return async (
    req: NextRequest,
    context: { params?: Record<string, string> } = {},
  ): Promise<NextResponse> => {
    // Authenticate
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve orgId from session user's team
    const userTeam = await (await import("@/lib/prisma")).default.userTeam.findFirst({
      where: { userId: session.user.id },
      select: { team: { select: { organizationId: true } } },
    });

    const orgId = userTeam?.team?.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found for user" },
        { status: 403 },
      );
    }

    // Resolve tier
    const tier = await resolveOrgTier(orgId);

    // Feature check
    if (options?.requiredFeature) {
      const access = await checkFeatureAccess(orgId, options.requiredFeature);
      if (!access.allowed) {
        return NextResponse.json(
          {
            error: "FEATURE_GATED",
            feature: options.requiredFeature,
            currentTier: tier.tier,
            ...access.meta,
          },
          { status: 403 },
        );
      }
    }

    // Contact limit check
    if (options?.checkContactLimit) {
      const check = await checkContactLimit(orgId);
      if (!check.allowed) {
        return NextResponse.json(check, { status: 403 });
      }
    }

    // E-sig limit check
    if (options?.checkEsigLimit) {
      const check = await checkEsigLimit(orgId);
      if (!check.allowed) {
        return NextResponse.json(check, { status: 403 });
      }
    }

    return handler(req, context, tier);
  };
}
