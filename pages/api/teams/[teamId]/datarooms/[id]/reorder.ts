import type { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth/next";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

type OrderItem = {
  id: string;
  category: "folder" | "document";
  orderIndex: number;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).end("Unauthorized");
  }

  const { id: dataroomId } = req.query as { teamId: string; id: string };
  const newOrder: OrderItem[] = req.body;

  if (
    !Array.isArray(newOrder) ||
    !dataroomId ||
    typeof dataroomId !== "string"
  ) {
    return res.status(400).json({ error: "Invalid input" });
  }

  try {
    await prisma.$transaction(async (prisma) => {
      for (const item of newOrder) {
        if (item.category === "folder") {
          await prisma.dataroomFolder.update({
            where: { id: item.id },
            data: { orderIndex: item.orderIndex },
          });
        } else {
          await prisma.dataroomDocument.update({
            where: { id: item.id },
            data: { orderIndex: item.orderIndex },
          });
        }
      }
    });

    res.status(200).json({ message: "Order updated successfully" });
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating order:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
