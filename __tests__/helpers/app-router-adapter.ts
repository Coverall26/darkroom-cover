/**
 * Adapter utility for testing App Router handlers with Pages Router test infrastructure.
 *
 * The existing test suite uses `createMocks()` from `node-mocks-http` which produces
 * Pages Router compatible req/res objects (NextApiRequest/NextApiResponse). App Router
 * handlers use NextRequest/NextResponse instead. This adapter bridges the two:
 *
 *   1. Converts NextApiRequest → NextRequest
 *   2. Calls the App Router handler
 *   3. Writes the NextResponse back to the mock NextApiResponse
 *
 * Usage:
 *   // Before (Pages Router):
 *   import handler from "@/pages/api/lp/register";
 *   await handler(req, res);
 *
 *   // After (App Router via adapter):
 *   import { POST } from "@/app/api/lp/register/route";
 *   const handler = wrapAppRouteHandler({ POST });
 *   await handler(req, res);
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { NextRequest, NextResponse } from "next/server";

type AppRouterHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse> | NextResponse;

interface AppRouterHandlers {
  GET?: AppRouterHandler;
  POST?: AppRouterHandler;
  PUT?: AppRouterHandler;
  PATCH?: AppRouterHandler;
  DELETE?: AppRouterHandler;
}

/**
 * Wraps App Router named-export handlers into a single Pages Router-compatible
 * handler function that works with `createMocks()` test infrastructure.
 *
 * @param handlers  Object mapping HTTP methods to App Router handler functions
 * @param routeParams  Dynamic route parameters (e.g. { id: "fund-1", investorId: "inv-1" })
 * @returns A Pages Router-style handler: `(req, res) => Promise<void>`
 *
 * @example
 * ```ts
 * import { POST } from "@/app/api/lp/register/route";
 * const handler = wrapAppRouteHandler({ POST });
 *
 * const { req, res } = createMocks({ method: "POST", body: { name: "Test" } });
 * await handler(req, res);
 * expect(res._getStatusCode()).toBe(200);
 * ```
 *
 * @example With dynamic route params:
 * ```ts
 * import { PATCH } from "@/app/api/admin/investors/[investorId]/review/route";
 * const handler = wrapAppRouteHandler({ PATCH }, { investorId: "inv-1" });
 * ```
 */
export function wrapAppRouteHandler(
  handlers: AppRouterHandlers,
  routeParams?: Record<string, string>,
) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const method = (req.method?.toUpperCase() || "GET") as keyof AppRouterHandlers;
    const handlerFn = handlers[method];

    if (!handlerFn) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Build URL from mock request
    const protocol = "http";
    const host = req.headers?.host || "localhost:3000";
    const path = req.url || "/api/test";
    const url = new URL(`${protocol}://${host}${path}`);

    // Add query params to URL
    if (req.query) {
      Object.entries(req.query).forEach(([key, value]) => {
        if (typeof value === "string") {
          url.searchParams.set(key, value);
        } else if (Array.isArray(value)) {
          value.forEach((v) => {
            if (typeof v === "string") url.searchParams.append(key, v);
          });
        }
      });
    }

    // Build headers from mock request
    const headers = new Headers();
    if (req.headers) {
      Object.entries(req.headers).forEach(([key, value]) => {
        if (typeof value === "string") {
          headers.set(key, value);
        } else if (Array.isArray(value)) {
          value.forEach((v) => headers.append(key, v));
        }
      });
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    // Build request init
    const init: RequestInit = { method, headers };
    if (req.body && method !== "GET" && method !== "HEAD") {
      init.body = JSON.stringify(req.body);
    }

    const nextReq = new NextRequest(url, init);

    // Build context with route params
    const context = routeParams
      ? { params: Promise.resolve(routeParams) }
      : { params: Promise.resolve({}) };

    // Call the App Router handler
    const nextRes = await handlerFn(nextReq, context);

    // Write the NextResponse back to the mock res
    const status = nextRes.status;
    res.status(status);

    // Copy response headers
    nextRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    // Read body and write to res
    try {
      const text = await nextRes.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          res.json(json);
        } catch {
          // Not JSON — write as raw text
          res.send(text);
        }
      } else {
        res.end();
      }
    } catch {
      res.end();
    }
  };
}

/**
 * Convenience: creates a module-like object that can be returned from
 * `await import(...)` in dynamic import tests. The `default` export is
 * the wrapped Pages Router-compatible handler.
 */
export function createMockModule(
  handlers: AppRouterHandlers,
  routeParams?: Record<string, string>,
) {
  return {
    default: wrapAppRouteHandler(handlers, routeParams),
    ...handlers,
  };
}
