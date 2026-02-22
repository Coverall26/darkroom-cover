import { Metadata } from "next";
import { Suspense } from "react";

import WelcomeClient from "./page-client";

const data = {
  description: "Welcome to FundRoom Investor Dataroom",
  title: "Welcome | FundRoom",
  url: "/welcome",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://fundroom.ai"),
  title: data.title,
  description: data.description,
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "FundRoom",
    images: [
      {
        url: "/_static/fundroom-logo-black.png",
        width: 800,
        height: 600,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.title,
    description: data.description,
    creator: "@fundroomai",
    images: ["/_static/fundroom-logo-black.png"],
  },
};

export default function WelcomePage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <WelcomeClient />
    </Suspense>
  );
}
