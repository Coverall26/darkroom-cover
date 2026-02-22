import { reportInfo, reportWarning } from "@/lib/error";

/**
 * Structured Request Logger
 *
 * Logs API requests to Rollbar at info level with sampling:
 * - 100% of errors (4xx, 5xx)
 * - 10% of successful requests (2xx, 3xx)
 *
 * Designed for Next.js API routes (Pages Router). Call at the start
 * of the request and use the returned `finish()` to record the outcome.
 *
 * Usage:
 *   const log = startRequestLog(req, userId);
 *   // ... handle request ...
 *   log.finish(res.statusCode);
 */

interface RequestLogEntry {
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  ip?: string;
}

interface RequestLogger {
  /** Call when the response is about to be sent */
  finish: (statusCode: number) => void;
}

export function startRequestLog(
  req: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined> },
  userId?: string,
): RequestLogger {
  const start = Date.now();
  const method = req.method || "UNKNOWN";
  const path = req.url?.split("?")[0] || "/";
  const ip =
    (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    (req.headers?.["x-real-ip"] as string) ||
    undefined;

  return {
    finish(statusCode: number) {
      const durationMs = Date.now() - start;
      const entry: RequestLogEntry = {
        method,
        path,
        status: statusCode,
        durationMs,
        userId,
        ip,
      };

      const isError = statusCode >= 400;

      // Sample: 100% of errors, 10% of successes
      if (isError) {
        reportWarning(`${method} ${path} ${statusCode} (${durationMs}ms)`, {
          ...entry,
          action: "request_log",
        });
      } else if (Math.random() < 0.1) {
        reportInfo(`${method} ${path} ${statusCode} (${durationMs}ms)`, {
          ...entry,
          action: "request_log_sampled",
        });
      }
    },
  };
}
