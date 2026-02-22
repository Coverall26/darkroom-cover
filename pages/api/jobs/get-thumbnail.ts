import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth";

import { getFileForDocumentPage } from "@/lib/documents/get-file-helper";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // We only allow GET requests
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).end("Unauthorized");
  }

  const { documentId, pageNumber, versionNumber } = req.query as {
    documentId: string;
    pageNumber: string;
    versionNumber: string;
  };

  try {
    const imageUrl = await getFileForDocumentPage(
      Number(pageNumber),
      documentId,
      versionNumber === "undefined" ? undefined : Number(versionNumber),
    );

    return res.status(200).json({ imageUrl });
  } catch (error) {
    reportError(error as Error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
}
