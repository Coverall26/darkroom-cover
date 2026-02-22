import { NextResponse } from "next/server";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { checkDatabaseHealth } from "@/lib/prisma";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/deployment-readiness
 *
 * Pre-flight verification for production deployments. Checks env vars,
 * database connectivity, schema status, storage, services, security keys,
 * and platform data readiness. Returns a pass/fail checklist.
 */

interface DeploymentCheck {
  category: string;
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  remediation?: string;
}

export async function GET() {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const checks: DeploymentCheck[] = [];

    // ── 1. Database ──
    let dbLatency: number | null = null;
    try {
      const dbResult = await checkDatabaseHealth();
      dbLatency = dbResult.latencyMs ?? null;
      checks.push({
        category: "Database",
        name: "Primary database connection",
        status: "pass",
        detail: `Connected (${dbLatency}ms latency)`,
      });
    } catch {
      checks.push({
        category: "Database",
        name: "Primary database connection",
        status: "fail",
        detail: "Cannot connect to database",
        remediation:
          "Verify SUPABASE_DATABASE_URL or DATABASE_URL is set and the database is accessible",
      });
    }

    // Schema table count check
    try {
      const tableCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      const count = Number(tableCount[0]?.count || 0);
      const expected = 117;
      checks.push({
        category: "Database",
        name: "Schema migration status",
        status: count >= expected - 5 ? "pass" : "warn",
        detail: `${count} tables found (expected ~${expected})`,
        remediation:
          count < expected - 5
            ? "Run 'npx prisma migrate deploy' to apply pending migrations"
            : undefined,
      });
    } catch {
      checks.push({
        category: "Database",
        name: "Schema migration status",
        status: "warn",
        detail: "Could not verify table count",
      });
    }

    // ── 2. Authentication ──
    checkEnvVar(checks, "Authentication", "NEXTAUTH_SECRET", {
      minLength: 32,
      remediation: "Generate with: openssl rand -hex 32",
    });
    checkEnvVar(checks, "Authentication", "NEXTAUTH_URL", {
      remediation:
        "Set to production URL (e.g., https://app.fundroom.ai)",
    });

    const hasGooglePrimary = !!process.env.FUNDROOM_GOOGLE_CLIENT_ID;
    const hasGoogleFallback = !!process.env.GOOGLE_CLIENT_ID;
    checks.push({
      category: "Authentication",
      name: "Google OAuth credentials",
      status: hasGooglePrimary
        ? "pass"
        : hasGoogleFallback
          ? "warn"
          : "fail",
      detail: hasGooglePrimary
        ? "FundRoom Google credentials configured"
        : hasGoogleFallback
          ? "Using legacy BFG fallback credentials"
          : "No Google OAuth credentials",
      remediation: !hasGooglePrimary
        ? "Set FUNDROOM_GOOGLE_CLIENT_ID and FUNDROOM_GOOGLE_CLIENT_SECRET"
        : undefined,
    });

    // ── 3. Email ──
    checkEnvVar(checks, "Email", "RESEND_API_KEY", {
      remediation: "Get API key from https://resend.com/api-keys",
    });

    // ── 4. Storage ──
    const storageProvider = process.env.STORAGE_PROVIDER;
    checks.push({
      category: "Storage",
      name: "Storage provider",
      status: storageProvider ? "pass" : "fail",
      detail: storageProvider
        ? `Provider: ${storageProvider}`
        : "STORAGE_PROVIDER not set",
      remediation: !storageProvider
        ? "Set STORAGE_PROVIDER to 'vercel', 's3', 'r2', or 'local'"
        : undefined,
    });

    if (storageProvider === "vercel") {
      checkEnvVar(checks, "Storage", "BLOB_READ_WRITE_TOKEN", {
        remediation: "Get token from Vercel Dashboard > Storage > Blob",
      });
    } else if (storageProvider === "s3" || storageProvider === "r2") {
      checkEnvVar(checks, "Storage", "STORAGE_BUCKET");
      checkEnvVar(checks, "Storage", "STORAGE_ACCESS_KEY");
      checkEnvVar(checks, "Storage", "STORAGE_SECRET_KEY");
    }

    // ── 5. Error Monitoring ──
    checkEnvVar(checks, "Monitoring", "ROLLBAR_SERVER_TOKEN", {
      remediation: "Get server token from Rollbar project settings",
    });
    checkEnvVar(checks, "Monitoring", "NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN", {
      remediation: "Get client token from Rollbar project settings",
    });

    // ── 6. Analytics (optional) ──
    checkEnvVar(checks, "Analytics", "TINYBIRD_TOKEN", {
      optional: true,
      remediation: "Get token from Tinybird workspace",
    });

    // ── 7. Encryption Keys ──
    const encryptionKeys = [
      "DOCUMENT_ENCRYPTION_SALT",
      "MASTER_ENCRYPTION_KEY",
      "HKDF_STORAGE_SALT",
      "SIGNATURE_VERIFICATION_SALT",
      "AUTH_TOKEN_HASHING_SALT",
    ];
    for (const key of encryptionKeys) {
      checkEnvVar(checks, "Security", key, {
        minLength: 64,
        remediation: `Generate with: openssl rand -hex 32 (must be 64 hex chars)`,
      });
    }

    // ── 8. Domain Configuration ──
    checkEnvVar(checks, "Domain", "NEXT_PUBLIC_BASE_URL", {
      remediation:
        "Set to production URL (e.g., https://app.fundroom.ai)",
    });

    // ── 9. Platform Data ──
    try {
      const orgCount = await prisma.organization.count();
      const teamCount = await prisma.team.count();
      const adminCount = await prisma.userTeam.count({
        where: { role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] } },
      });

      checks.push({
        category: "Data",
        name: "Tenant seeded",
        status: orgCount > 0 && teamCount > 0 ? "pass" : "fail",
        detail: `${orgCount} organizations, ${teamCount} teams`,
        remediation:
          orgCount === 0
            ? "Run: npx ts-node prisma/seed-bermuda.ts"
            : undefined,
      });

      checks.push({
        category: "Data",
        name: "Admin users exist",
        status: adminCount > 0 ? "pass" : "fail",
        detail: `${adminCount} admin team members`,
        remediation:
          adminCount === 0
            ? "Run: npx ts-node prisma/seed-platform-admin.ts --set-password"
            : undefined,
      });
    } catch {
      checks.push({
        category: "Data",
        name: "Platform data check",
        status: "warn",
        detail: "Could not query platform data",
      });
    }

    // ── 10. Paywall Configuration ──
    const paywallBypass = process.env.PAYWALL_BYPASS === "true";
    checks.push({
      category: "Billing",
      name: "Paywall configuration",
      status: "pass",
      detail: paywallBypass
        ? "PAYWALL_BYPASS=true (MVP mode, no Stripe required)"
        : "Paywall enforced (Stripe integration active)",
    });

    // ── Summary ──
    const failCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;
    const passCount = checks.filter((c) => c.status === "pass").length;

    const overallStatus =
      failCount > 0
        ? "not_ready"
        : warnCount > 0
          ? "ready_with_warnings"
          : "ready";

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: {
        total: checks.length,
        pass: passCount,
        warn: warnCount,
        fail: failCount,
      },
      checks,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[DEPLOYMENT_READINESS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function checkEnvVar(
  checks: DeploymentCheck[],
  category: string,
  varName: string,
  opts: {
    minLength?: number;
    optional?: boolean;
    remediation?: string;
  } = {},
) {
  const value = process.env[varName];
  const exists = !!value;
  const meetsLength = opts.minLength
    ? (value?.length || 0) >= opts.minLength
    : true;

  if (!exists) {
    checks.push({
      category,
      name: varName,
      status: opts.optional ? "warn" : "fail",
      detail: `${varName} is not set`,
      remediation: opts.remediation,
    });
  } else if (!meetsLength) {
    checks.push({
      category,
      name: varName,
      status: "warn",
      detail: `${varName} is set but may be too short (${value!.length} chars, expected ${opts.minLength}+)`,
      remediation: opts.remediation,
    });
  } else {
    checks.push({
      category,
      name: varName,
      status: "pass",
      detail: `${varName} configured`,
    });
  }
}
