import type { AppProps } from "next/app";
import localFont from "next/font/local";
import Head from "next/head";

import { TeamProvider } from "@/context/team-context";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { NuqsAdapter } from "nuqs/adapters/next/pages";
import { Provider as RollbarProvider, ErrorBoundary } from "@rollbar/react";

import { EXCLUDED_PATHS } from "@/lib/constants";
import { clientConfig } from "@/lib/rollbar";

import { PostHogCustomProvider } from "@/components/providers/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PWAInstallPrompt } from "@/components/pwa-install";
import { CookieConsentBanner } from "@/components/tracking/cookie-consent-banner";
import { TrackingInitializer } from "@/components/tracking/tracking-initializer";
import { FaviconSwitcher } from "@/components/branding/favicon-switcher";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@/styles/globals.css";

const inter = localFont({
  src: "../public/fonts/inter-variable.woff2",
  variable: "--font-inter",
  display: "swap",
});

export default function App({
  Component,
  pageProps: { session, ...pageProps },
  router,
}: AppProps<{ session: Session }>) {
  return (
    <RollbarProvider config={clientConfig}>
      <ErrorBoundary>
        <div id="app-root">
          <Head>
            <title>FundRoom AI</title>
            <meta name="theme-color" content="#000000" />
            <meta
              name="description"
              content="FundRoom AI — Secure GP/LP management platform for 506(c) funds."
              key="description"
            />
            {/* Signature fonts for e-signature customization */}
            <link 
              href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Pacifico&family=Sacramento&family=Allura&display=swap" 
              rel="stylesheet" 
            />
            <meta
              property="og:title"
              content="FundRoom AI"
              key="og-title"
            />
            <meta
              property="og:description"
              content="FundRoom AI — Secure GP/LP management platform for 506(c) funds."
              key="og-description"
            />
            <meta
              property="og:image"
              content="/_static/fundroom-og.png"
              key="og-image"
            />
            <meta
              property="og:url"
              content="https://fundroom.ai"
              key="og-url"
            />
            <meta property="og:type" content="website" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:site" content="@fundroomai" />
            <meta name="twitter:creator" content="@fundroomai" />
            <meta name="twitter:title" content="FundRoom AI" key="tw-title" />
            <meta
              name="twitter:description"
              content="FundRoom AI — Secure GP/LP management platform for 506(c) funds."
              key="tw-description"
            />
            <meta
              name="twitter:image"
              content="/_static/fundroom-og.png"
              key="tw-image"
            />
            <link rel="icon" href="/favicon.ico" sizes="any" key="favicon-ico" />
            <link rel="icon" type="image/png" sizes="32x32" href="/icons/fundroom/favicon-32x32.png" key="favicon-32" />
            <link rel="icon" type="image/png" sizes="16x16" href="/icons/fundroom/favicon-16x16.png" key="favicon-16" />
          </Head>
          <SessionProvider session={session}>
            <PostHogCustomProvider>
              <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
                <NuqsAdapter>
                  <main className={inter.className}>
                    <Toaster closeButton />
                    <TooltipProvider delayDuration={100}>
                      {EXCLUDED_PATHS.includes(router.pathname) ? (
                        <Component {...pageProps} />
                      ) : (
                        <TeamProvider>
                          <Component {...pageProps} />
                        </TeamProvider>
                      )}
                    </TooltipProvider>
                    <FaviconSwitcher />
                    <PWAInstallPrompt />
                    <CookieConsentBanner />
                    <TrackingInitializer />
                    <Analytics />
                    <SpeedInsights />
                  </main>
                </NuqsAdapter>
              </ThemeProvider>
            </PostHogCustomProvider>
          </SessionProvider>
        </div>
      </ErrorBoundary>
    </RollbarProvider>
  );
}
