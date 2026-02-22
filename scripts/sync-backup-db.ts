/**
 * One-time data sync from Supabase (primary) to Replit Postgres (backup).
 *
 * Usage:
 *   DATABASE_URL=<supabase_url> REPLIT_DATABASE_URL=<replit_url> npx tsx scripts/sync-backup-db.ts
 *
 * This script:
 * 1. Connects to both databases
 * 2. Reads all tables from primary in dependency order
 * 3. Batch-upserts into backup (500 rows per batch)
 * 4. Is idempotent — safe to re-run
 *
 * Claude: Implement the full table dependency ordering based on the Prisma schema.
 * The TABLE_ORDER below is a starting point — adjust based on foreign key relationships.
 */

import { PrismaClient } from "@prisma/client";

const BATCH_SIZE = 500;

const TABLE_ORDER = [
  "user",
  "account",
  "session",
  "organization",
  "organizationDefaults",
  "team",
  "userTeam",
  "fund",
  "investor",
  "investment",
  "document",
  "documentVersion",
  "dataroom",
  "dataroomDocument",
  "dataroomFolder",
  "link",
  "view",
  "viewer",
  "signatureDocument",
  "signatureRecipient",
  "signatureField",
  "signatureAuditLog",
  "transaction",
  "auditLog",
  "verificationToken",
];

async function main() {
  const primaryUrl = process.env.DATABASE_URL;
  const backupUrl = process.env.REPLIT_DATABASE_URL;

  if (!primaryUrl || !backupUrl) {
    console.error("Both DATABASE_URL and REPLIT_DATABASE_URL must be set");
    process.exit(1);
  }

  const primary = new PrismaClient({ datasourceUrl: primaryUrl });
  const backup = new PrismaClient({ datasourceUrl: backupUrl });

  try {
    console.log("Starting data sync from Supabase → Replit Postgres...\n");

    for (const tableName of TABLE_ORDER) {
      const modelClient = (primary as any)[tableName];
      const backupModelClient = (backup as any)[tableName];

      if (!modelClient || !backupModelClient) {
        console.warn(`  Skipping ${tableName} — model not found on client`);
        continue;
      }

      try {
        const count = await modelClient.count();
        console.log(`  ${tableName}: ${count} rows`);

        if (count === 0) continue;

        let offset = 0;
        let synced = 0;

        while (offset < count) {
          const rows = await modelClient.findMany({
            skip: offset,
            take: BATCH_SIZE,
          });

          for (const row of rows) {
            try {
              await backupModelClient.upsert({
                where: { id: row.id },
                create: row,
                update: row,
              });
              synced++;
            } catch (err) {
              console.error(
                `    Failed to sync ${tableName} id=${row.id}:`,
                err instanceof Error ? err.message : err,
              );
            }
          }

          offset += BATCH_SIZE;
          if (offset < count) {
            process.stdout.write(
              `    ...synced ${synced}/${count}\r`,
            );
          }
        }

        console.log(`    ✓ Synced ${synced}/${count} rows`);
      } catch (err) {
        console.error(
          `  ERROR syncing ${tableName}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    console.log("\nSync complete!");
  } finally {
    await primary.$disconnect();
    await backup.$disconnect();
  }
}

main().catch(console.error);
