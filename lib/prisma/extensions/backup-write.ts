import { Prisma } from "@prisma/client";

import { isBackupEnabled } from "../backup-client";
import { enqueueBackup } from "../backup-queue";

/**
 * Strips Prisma relation fields from a result object, leaving only scalar fields
 * suitable for create/update data. Relations (objects with .id, arrays) would
 * cause errors if passed as data to Prisma.
 */
function stripRelations(obj: any): Record<string, any> {
  if (!obj || typeof obj !== "object") return obj;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }
    if (value instanceof Date) {
      result[key] = value;
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      // Skip relation objects (they have an "id" property)
      if ("id" in (value as any)) continue;
      // Keep JSON/jsonb fields (plain objects without "id")
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      // Arrays are always relation fields in Prisma results — skip
      continue;
    }
    result[key] = value;
  }
  return result;
}

/**
 * Enqueue an upsert for a single record using its result data from the primary DB.
 * Uses stripRelations to ensure only scalar fields are included.
 */
function replicateResult(model: string, result: any): void {
  if (!result || !(result as any).id) return;
  const data = stripRelations(result);
  enqueueBackup(
    model,
    "upsert",
    {
      where: { id: (result as any).id },
      create: data,
      update: data,
    },
    (result as any).id,
  );
}

export const backupWriteExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: "backup-write",
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = await query(args);
          if (isBackupEnabled()) {
            replicateResult(model, result);
          }
          return result;
        },

        async update({ model, args, query }) {
          const result = await query(args);
          if (isBackupEnabled()) {
            replicateResult(model, result);
          }
          return result;
        },

        async upsert({ model, args, query }) {
          const result = await query(args);
          if (isBackupEnabled()) {
            replicateResult(model, result);
          }
          return result;
        },

        async delete({ model, args, query }) {
          const result = await query(args);
          if (isBackupEnabled() && result && (result as any).id) {
            enqueueBackup(
              model,
              "delete",
              { where: { id: (result as any).id } },
              (result as any).id,
            );
          }
          return result;
        },

        async createMany({ model, args, query }) {
          const result = await query(args);
          if (!isBackupEnabled() || !args?.data) return result;

          // createMany doesn't return records. Replicate using input data.
          // Items with explicit IDs are upserted individually.
          // Items without IDs can't be replicated (IDs are generated server-side).
          const items = Array.isArray(args.data) ? args.data : [args.data];
          for (const item of items) {
            if ("id" in item && item.id) {
              enqueueBackup(
                model,
                "upsert",
                {
                  where: { id: (item as any).id },
                  create: item,
                  update: item,
                },
                (item as any).id,
              );
            }
          }
          return result;
        },

        async updateMany({ model, args, query }) {
          const result = await query(args);
          if (!isBackupEnabled() || !args?.where || !args?.data) return result;

          // updateMany doesn't return records. Replay the same updateMany
          // on backup with the same where clause and data.
          enqueueBackup(model, "updateMany", {
            where: args.where,
            data: args.data,
          });
          return result;
        },

        async deleteMany({ model, args, query }) {
          const result = await query(args);
          if (isBackupEnabled() && args?.where) {
            enqueueBackup(model, "deleteMany", { where: args.where });
          }
          return result;
        },
      },
    },
  });
});
