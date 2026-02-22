import type { NextApiRequest, NextApiResponse } from "next";
import {
  getBrandFromHost,
  getBrandManifestIcons,
  getBrandName,
} from "@/lib/branding/favicon";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const host = req.headers.host || req.headers["x-forwarded-host"] as string;
  const brand = getBrandFromHost(host);
  const name = getBrandName(brand);

  const manifest = {
    name,
    short_name: "FundRoom",
    description:
      "Secure investor portal for fund management, document signing, and capital tracking",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#059669",
    orientation: "portrait-primary",
    scope: "/",
    icons: getBrandManifestIcons(brand),
    categories: ["finance", "business", "productivity"],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "View your investor dashboard",
        url: "/lp/dashboard",
        icons: [{ src: `/icons/${brand}/icon-96x96.png`, sizes: "96x96" }],
      },
      {
        name: "Documents",
        short_name: "Docs",
        description: "View your documents",
        url: "/lp/documents",
        icons: [{ src: `/icons/${brand}/icon-96x96.png`, sizes: "96x96" }],
      },
    ],
    screenshots: [],
    prefer_related_applications: false,
  };

  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json(manifest);
}
