import { checkBotId } from "botid/server";
import { NextApiRequest, NextApiResponse } from "next";
import { NextRequest, NextResponse } from "next/server";

import { reportWarning } from "@/lib/error";

export interface BotCheckResult {
  isBot: boolean;
  /** Pass-through — true when BotID cannot classify (e.g. local dev). */
  isUnknown?: boolean;
}

/**
 * Server-side Vercel BotID check for **App Router** route handlers.
 *
 * Returns `{ blocked: true, response }` when a bot is detected so the
 * caller can return early. Returns `{ blocked: false }` otherwise.
 */
export async function verifyNotBot(): Promise<
  | { blocked: true; response: NextResponse }
  | { blocked: false }
> {
  try {
    const result = await checkBotId();

    if (result.isBot) {
      reportWarning("Bot request blocked by BotID", {
        action: "bot_blocked",
      });

      return {
        blocked: true,
        response: NextResponse.json(
          { error: "Access denied" },
          { status: 403 },
        ),
      };
    }

    return { blocked: false };
  } catch (error) {
    // BotID failures should never break the app — fail open
    console.error("[BotID] Verification error:", error);
    return { blocked: false };
  }
}

/**
 * Server-side Vercel BotID check for **Pages Router** API routes.
 *
 * Returns `false` if the request is blocked (response already sent).
 * Returns `true` if the request should proceed.
 */
export async function verifyNotBotPages(
  _req: NextApiRequest,
  res: NextApiResponse,
): Promise<boolean> {
  try {
    const result = await checkBotId();

    if (result.isBot) {
      reportWarning("Bot request blocked by BotID (pages)", {
        action: "bot_blocked",
      });

      res.status(403).json({ error: "Access denied" });
      return false;
    }

    return true;
  } catch (error) {
    // Fail open — never break the app on BotID errors
    console.error("[BotID] Verification error (pages):", error);
    return true;
  }
}

/**
 * HOF wrapper for Pages Router handlers, analogous to `withRateLimit`.
 *
 * Usage:
 * ```ts
 * export default withBotProtection(async (req, res) => { ... });
 * ```
 */
export function withBotProtection(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const allowed = await verifyNotBotPages(req, res);
    if (!allowed) return;
    return handler(req, res);
  };
}
