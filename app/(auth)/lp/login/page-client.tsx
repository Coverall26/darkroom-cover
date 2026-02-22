"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { LPSignIn } from "@/components/auth/lp-signin";
import { useTracking } from "@/lib/tracking/use-tracking";
import { getBrandFromHost, getBrandConfig, type BrandConfig } from "@/lib/branding/favicon";
import { PoweredByFooter, PoweredByCorner } from "@/components/branding/powered-by-fundroom";

export default function LPLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  
  const { trackFunnel } = useTracking();

  const [brand, setBrand] = useState<BrandConfig>(getBrandConfig("fundroom"));
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const detectedBrand = getBrandFromHost(window.location.hostname);
      setBrand(getBrandConfig(detectedBrand));
      setIsCustomBrand(detectedBrand !== "fundroom");
    }
  }, []);

  const next = useMemo(() => {
    const nextParam = searchParams?.get("next");
    if (!nextParam) return null;
    const decoded = decodeURIComponent(nextParam);
    if (decoded.includes("/login") || decoded.includes("/lp/login")) {
      return null;
    }
    return decoded;
  }, [searchParams]);

  useEffect(() => {
    if (status === "authenticated") {
      trackFunnel({
        name: "funnel_lp_onboarding_started",
        properties: {},
      });
      const callbackUrl = next || "/lp/dashboard";
      router.replace(callbackUrl);
    }
  }, [status, router, next]);

  // Handle authentication errors from URL params
  const authError = searchParams?.get("error");
  useEffect(() => {
    if (authError) {
      const errorMessages: Record<string, string> = {
        Verification: "This link has expired. Request a new one.",
        AccessDenied: "Access denied. You may not have permission to access this portal.",
        OAuthCallback: "Sign in was cancelled. Try again.",
        OAuthSignin: "Sign in was cancelled. Try again.",
        Configuration: "There was a configuration error. Please try again.",
        Default: "An error occurred during sign in. Please try again.",
      };
      const message = errorMessages[authError] || errorMessages.Default;
      toast.error(message);
      // Clear the error from URL without refresh
      window.history.replaceState({}, '', '/lp/login');
    }
  }, [authError]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500" />
      </div>
    );
  }

  if (status === "authenticated") {
    return null;
  }

  const callbackUrl = next || "/lp/dashboard";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col items-center justify-center p-4 relative">
      {isCustomBrand && <PoweredByCorner theme="dark" />}
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brand.logoDark}
              alt={brand.name}
              className={isCustomBrand ? "h-16 w-auto mx-auto mb-4" : "h-12 w-auto mx-auto mb-4"}
            />
            <h1 className="text-2xl font-bold text-white">{brand.shortName}</h1>
          </Link>
          <p className="text-gray-400 mt-2">Investor Portal</p>
        </div>

        <LPSignIn callbackUrl={callbackUrl} showOnboardLink={true} />

        <div className="mt-8 text-center">
          <Link
            href="/login"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Return to main login
          </Link>
        </div>
      </div>
      {isCustomBrand && (
        <div className="absolute bottom-0 left-0 right-0">
          <PoweredByFooter theme="dark" />
        </div>
      )}
    </div>
  );
}
