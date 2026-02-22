import { PrismaClient } from "@prisma/client";

let backupPrisma: PrismaClient | null = null;

export function isBackupEnabled(): boolean {
  return (
    process.env.BACKUP_DB_ENABLED === "true" &&
    !!process.env.REPLIT_DATABASE_URL
  );
}

export function getBackupPrismaClient(): PrismaClient | null {
  if (!isBackupEnabled()) return null;

  if (!backupPrisma) {
    backupPrisma = new PrismaClient({
      datasourceUrl: process.env.REPLIT_DATABASE_URL,
      log: ["error"],
    });
  }
  return backupPrisma;
}

export async function disconnectBackup(): Promise<void> {
  if (backupPrisma) {
    await backupPrisma.$disconnect();
    backupPrisma = null;
  }
}
