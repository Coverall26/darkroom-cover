import { Metadata } from "next";
import MarketplaceBrowseClient from "./page-client";

export const metadata: Metadata = {
  title: "Investment Marketplace | FundRoom",
  description:
    "Browse curated investment opportunities from vetted fund managers. Private equity, venture capital, real estate, and more.",
  openGraph: {
    title: "Investment Marketplace | FundRoom",
    description:
      "Browse curated investment opportunities from vetted fund managers.",
    type: "website",
    siteName: "FundRoom",
  },
};

/**
 * Public marketplace landing page — no authentication required.
 * Shows active listings + waitlist signup for potential investors.
 */
export default function MarketplaceBrowsePage() {
  return <MarketplaceBrowseClient />;
}
