import { Prisma } from "@prisma/client";

const SOFT_DELETE_MODELS = ["Document", "Dataroom", "Team"] as const;
type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

function isSoftDeleteModel(model: string): model is SoftDeleteModel {
  return SOFT_DELETE_MODELS.includes(model as SoftDeleteModel);
}

function addDeletedAtFilter(args: any): any {
  return {
    ...args,
    where: {
      ...args?.where,
      deletedAt: null,
    },
  };
}

export const softDeleteExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: "soft-delete",
    query: {
      document: {
        async findMany({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async findFirst({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (result && (result as any).deletedAt !== null) {
            return null;
          }
          return result;
        },
        async findUniqueOrThrow({ args, query }) {
          const result = await query(args);
          if (result && (result as any).deletedAt !== null) {
            throw new Prisma.PrismaClientKnownRequestError("Record not found", {
              code: "P2025",
              clientVersion: "5.0.0",
            });
          }
          return result;
        },
        async findFirstOrThrow({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async count({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async aggregate({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async groupBy({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async delete({ args }) {
          return (client.document.update as any)({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ args }) {
          return (client.document.updateMany as any)({
            where: args?.where,
            data: { deletedAt: new Date() },
          });
        },
      },
      dataroom: {
        async findMany({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async findFirst({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (result && (result as any).deletedAt !== null) {
            return null;
          }
          return result;
        },
        async findUniqueOrThrow({ args, query }) {
          const result = await query(args);
          if (result && (result as any).deletedAt !== null) {
            throw new Prisma.PrismaClientKnownRequestError("Record not found", {
              code: "P2025",
              clientVersion: "5.0.0",
            });
          }
          return result;
        },
        async findFirstOrThrow({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async count({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async aggregate({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async groupBy({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async delete({ args }) {
          return (client.dataroom.update as any)({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ args }) {
          return (client.dataroom.updateMany as any)({
            where: args?.where,
            data: { deletedAt: new Date() },
          });
        },
      },
      team: {
        async findMany({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async findFirst({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          if (result && (result as any).deletedAt !== null) {
            return null;
          }
          return result;
        },
        async findUniqueOrThrow({ args, query }) {
          const result = await query(args);
          if (result && (result as any).deletedAt !== null) {
            throw new Prisma.PrismaClientKnownRequestError("Record not found", {
              code: "P2025",
              clientVersion: "5.0.0",
            });
          }
          return result;
        },
        async findFirstOrThrow({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async count({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async aggregate({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async groupBy({ args, query }) {
          return query(addDeletedAtFilter(args));
        },
        async delete({ args }) {
          return (client.team.update as any)({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ args }) {
          return (client.team.updateMany as any)({
            where: args?.where,
            data: { deletedAt: new Date() },
          });
        },
      },
    },
  });
});

export function createRawPrismaClient() {
  const { PrismaClient } = require("@prisma/client");
  return new PrismaClient();
}
