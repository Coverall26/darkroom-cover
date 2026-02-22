/**
 * Server-Sent Events (SSE) Streaming Endpoint — Phase 2 Prep
 *
 * GET /api/sse?orgId=xxx
 *
 * Streams real-time events to connected clients. Requires authentication.
 * Events are scoped to the user's organization for multi-tenant isolation.
 *
 * Sends a heartbeat ping every 30s to keep the connection alive.
 */

import { NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import { subscribeSSE, type SSEEvent } from "@/lib/sse/event-emitter";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Auth check
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  // Resolve orgId from user's team membership
  const url = new URL(req.url);
  const requestedOrgId = url.searchParams.get("orgId");

  // Verify user belongs to this org
  const userTeam = await prisma.userTeam.findFirst({
    where: {
      user: { email: auth.email },
      status: "ACTIVE",
      ...(requestedOrgId ? { team: { organizationId: requestedOrgId } } : {}),
    },
    select: { team: { select: { organizationId: true } } },
  });

  if (!userTeam?.team?.organizationId) {
    return new Response(JSON.stringify({ error: "No active team membership" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const orgId = userTeam.team.organizationId;

  // Set up SSE stream
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ orgId, timestamp: new Date().toISOString() })}\n\n`)
      );

      // Subscribe to org events
      unsubscribe = subscribeSSE(orgId, (event: SSEEvent) => {
        try {
          const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        } catch {
          // Stream may be closed — ignore
        }
      });

      // Heartbeat every 30s
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Stream closed
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (unsubscribe) unsubscribe();
        }
      }, 30_000);
    },
    cancel() {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
