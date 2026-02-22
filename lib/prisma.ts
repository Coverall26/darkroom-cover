import { PrismaClient } from "@prisma/client";
import { backupWriteExtension } from "./prisma/extensions/backup-write";
import { softDeleteExtension } from "./prisma/extensions/soft-delete";
import { auditLogExtension } from "./prisma/extensions/audit-log";
import { reportError } from "./error";

declare global {
  var prisma: ReturnType<typeof createPrismaClient> | undefined;
}

function buildDatasourceUrl(): string | undefined {
  const baseUrl =
    process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  if (!baseUrl) return undefined;

  // Supabase uses PgBouncer on port 6543 (transaction mode).
  // Append connection pool params if not already present.
  try {
    const url = new URL(baseUrl);
    const isPgBouncer =
      url.port === "6543" || url.searchParams.has("pgbouncer");

    if (isPgBouncer && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) {
      // Vercel serverless: keep pool small per instance
      url.searchParams.set(
        "connection_limit",
        process.env.DATABASE_CONNECTION_LIMIT || "5"
      );
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "10");
    }
    return url.toString();
  } catch {
    // If URL parsing fails, return as-is
    return baseUrl;
  }
}

function createPrismaClient() {
  const datasourceUrl = buildDatasourceUrl();

  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

  return baseClient
    .$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const before = Date.now();
            const result = await query(args);
            const duration = Date.now() - before;
            if (duration > 500) {
              const msg = `Slow query: ${model}.${operation} took ${duration}ms`;
              console.warn(msg);
              try {
                reportError(new Error(msg));
              } catch {
                // Ignore error reporting failures
              }
            }
            return result;
          },
        },
      },
    })
    .$extends(softDeleteExtension)
    .$extends(auditLogExtension)
    .$extends(backupWriteExtension);
}

const prisma = global.prisma || createPrismaClient();

if (process.env.NODE_ENV === "development") global.prisma = prisma;

export default prisma;

/**
 * Reusable database health check.
 * Returns latency in ms or throws on failure.
 */
export async function checkDatabaseHealth(): Promise<{ status: "up"; latencyMs: number }> {
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return { status: "up", latencyMs: Date.now() - start };
}

/**
 * Retry wrapper for transient database errors (connection reset, timeout).
 * Retries up to `maxRetries` times with exponential backoff.
 */
export async function withDatabaseRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const msg = lastError.message || "";
      const isTransient =
        msg.includes("Can't reach database server") ||
        msg.includes("Connection timed out") ||
        msg.includes("Connection reset") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("Connection pool timeout");

      if (!isTransient || attempt === maxRetries) {
        throw lastError;
      }
      // Exponential backoff: 200ms, 400ms
      const delay = 200 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Graceful shutdown: disconnect Prisma on process termination
if (typeof process !== "undefined") {
  const gracefulShutdown = async () => {
    try {
      await prisma.$disconnect();
    } catch (e) {
      reportError(e as Error);
    }
  };

  process.on("SIGTERM", gracefulShutdown);
  process.on("SIGINT", gracefulShutdown);
}

export { runWithAuditContext, getAuditContext } from "./prisma/extensions/audit-log";
export { createRawPrismaClient } from "./prisma/extensions/soft-delete";
