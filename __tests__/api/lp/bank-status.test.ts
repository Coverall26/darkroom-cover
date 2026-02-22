// @ts-nocheck
/**
 * LP Bank Status API Tests
 *
 * Tests for app/api/lp/bank/status/route.ts
 *
 * Plaid is Phase 2. The endpoint returns 200 with configured=false and phase="V2".
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

import { GET } from "@/app/api/lp/bank/status/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";

const handler = wrapAppRouteHandler({ GET });

describe("LP Bank Status API (Plaid Disabled)", () => {
  it("should return 200 with configured=false indicating Phase 2", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.configured).toBe(false);
    expect(data.hasBankLink).toBe(false);
    expect(data.phase).toBe("V2");
  });

  it("should return 405 for POST method", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
