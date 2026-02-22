import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { receiver } from "@/lib/cron";
import { log } from "@/lib/utils";
import { reportError } from "@/lib/error";

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const AUDIT_LOG_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "2555");
const SIGNATURE_AUDIT_RETENTION_DAYS = parseInt(process.env.SIGNATURE_AUDIT_LOG_RETENTION_DAYS || "2555");

export async function POST(req: Request) {
  const body = await req.json();
  
  if (process.env.VERCEL === "1") {
    if (!receiver) {
      return new Response("Receiver not configured", { status: 500 });
    }
    const isValid = await receiver.verify({
      signature: req.headers.get("Upstash-Signature") || "",
      body: JSON.stringify(body),
    });
    if (!isValid) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const auditLogCutoff = new Date();
    auditLogCutoff.setDate(auditLogCutoff.getDate() - AUDIT_LOG_RETENTION_DAYS);

    const signatureAuditCutoff = new Date();
    signatureAuditCutoff.setDate(signatureAuditCutoff.getDate() - SIGNATURE_AUDIT_RETENTION_DAYS);

    const auditLogResult = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: auditLogCutoff,
        },
      },
    });

    const signatureAuditResult = await prisma.signatureAuditLog.deleteMany({
      where: {
        createdAt: {
          lt: signatureAuditCutoff,
        },
      },
    });

    log({
      message: `Audit log retention cleanup completed`,
      type: "cron",
      mention: false,
    });

    return NextResponse.json({
      success: true,
      deletedAuditLogs: auditLogResult.count,
      deletedSignatureAuditLogs: signatureAuditResult.count,
      retentionDays: {
        auditLog: AUDIT_LOG_RETENTION_DAYS,
        signatureAuditLog: SIGNATURE_AUDIT_RETENTION_DAYS,
      },
    });
  } catch (error) {
    reportError(error as Error);
    log({
      message: `Audit log retention cleanup failed: ${error}`,
      type: "cron",
      mention: true,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  const auditLogCutoff = new Date();
  auditLogCutoff.setDate(auditLogCutoff.getDate() - AUDIT_LOG_RETENTION_DAYS);

  const signatureAuditCutoff = new Date();
  signatureAuditCutoff.setDate(signatureAuditCutoff.getDate() - SIGNATURE_AUDIT_RETENTION_DAYS);

  const [auditLogCount, signatureAuditCount, oldAuditLogCount, oldSignatureAuditCount] = await Promise.all([
    prisma.auditLog.count(),
    prisma.signatureAuditLog.count(),
    prisma.auditLog.count({
      where: { createdAt: { lt: auditLogCutoff } },
    }),
    prisma.signatureAuditLog.count({
      where: { createdAt: { lt: signatureAuditCutoff } },
    }),
  ]);

  return NextResponse.json({
    status: "Audit log retention policy active",
    retention: {
      auditLogDays: AUDIT_LOG_RETENTION_DAYS,
      signatureAuditLogDays: SIGNATURE_AUDIT_RETENTION_DAYS,
    },
    counts: {
      totalAuditLogs: auditLogCount,
      totalSignatureAuditLogs: signatureAuditCount,
      expiredAuditLogs: oldAuditLogCount,
      expiredSignatureAuditLogs: oldSignatureAuditCount,
    },
  });
}
