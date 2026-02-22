/**
 * Test utilities for App Router handler testing.
 *
 * Provides helpers to create NextRequest objects and extract
 * response data from App Router handlers (which return NextResponse).
 */
import { NextRequest } from "next/server";

interface AppRouterRequestOptions {
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

/**
 * Creates a NextRequest for testing App Router handlers.
 */
export function createTestRequest(
  method: string,
  path: string = "/api/test",
  options: AppRouterRequestOptions = {},
): NextRequest {
  const url = new URL(`http://localhost:3000${path}`);
  if (options.query) {
    Object.entries(options.query).forEach(([k, v]) =>
      url.searchParams.set(k, v),
    );
  }

  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      "user-agent": "test-agent",
      ...(options.headers || {}),
    },
  };

  if (options.body && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(options.body);
  }

  const req = new NextRequest(url, init);

  // Set cookies if provided
  if (options.cookies) {
    Object.entries(options.cookies).forEach(([name, value]) => {
      req.cookies.set(name, value);
    });
  }

  return req;
}

/**
 * Extracts JSON data from a NextResponse.
 */
export async function getResponseData(
  response: Response,
): Promise<Record<string, unknown>> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
