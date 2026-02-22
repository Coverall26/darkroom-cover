import { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/styles/globals.css";
import { Providers } from "./providers";

const inter = localFont({
  src: "../public/fonts/inter-variable.woff2",
  variable: "--font-inter",
  display: "swap",
});

const data = {
  description:
    "FundRoom AI — Secure GP/LP management platform for 506(c) funds. Document sharing, e-signatures, investor onboarding, and compliance.",
  title: "FundRoom AI",
  url: "/",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://fundroom.ai"),
  title: data.title,
  description: data.description,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/fundroom/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/fundroom/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/fundroom/apple-touch-icon.png",
  },
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "FundRoom AI",
    images: [
      {
        url: "/_static/fundroom-og.png",
        width: 1200,
        height: 630,
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
    images: ["/_static/fundroom-og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=JetBrains+Mono:wght@400;500;600;700&family=Pacifico&family=Sacramento&family=Allura&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:text-sm focus:shadow-lg"
        >
          Skip to main content
        </a>
        <Providers>
          <div id="main-content">{children}</div>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
