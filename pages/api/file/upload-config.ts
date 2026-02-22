import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const uploadTransport = process.env.NEXT_PUBLIC_UPLOAD_TRANSPORT || "vercel";

  res.status(200).json({
    transport: uploadTransport,
  });
}
