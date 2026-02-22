"use client";

import { useState, useEffect } from "react";
import { isPlatformDomain, isInfrastructureDomain } from "@/lib/constants/saas-config";
import type { BrandConfig } from "@/lib/branding/favicon";
import { getBrandConfig } from "@/lib/branding/favicon";
import type { TenantBrandingResponse } from "@/pages/api/branding/tenant";

export interface TenantBranding {
  brand: BrandConfig;
  isCustomBrand: boolean;
  tenantName: string | null;
  tenantLogo: string | null;
  tenantBrandColor: string | null;
  tenantAccentColor: string | null;
  tenantDescription: string | null;
  loading: boolean;
}

export function useTenantBranding(): TenantBranding {
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState<TenantBrandingResponse | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const host = window.location.hostname.toLowerCase();

    if (isPlatformDomain(host) || isInfrastructureDomain(host)) {
      setLoading(false);
      return;
    }

    fetch(`/api/branding/tenant?host=${encodeURIComponent(host)}`)
      .then((res) => res.json())
      .then((data: TenantBrandingResponse) => {
        setTenantData(data);
      })
      .catch((e) => console.error("[useTenantBranding] Failed to load branding:", e))
      .finally(() => setLoading(false));
  }, []);

  if (!tenantData?.isTenant) {
    return {
      brand: getBrandConfig("fundroom"),
      isCustomBrand: false,
      tenantName: null,
      tenantLogo: null,
      tenantBrandColor: null,
      tenantAccentColor: null,
      tenantDescription: null,
      loading,
    };
  }

  const tenantBrand: BrandConfig = {
    key: "fundroom",
    name: tenantData.orgName || "Investor Portal",
    shortName: tenantData.orgName || "Portal",
    tagline: "",
    description: tenantData.orgDescription || "",
    logoLight: tenantData.orgLogo || "/_static/fundroom-logo-black.png",
    logoDark: tenantData.orgLogo || "/_static/fundroom-logo-white.png",
    iconLight: tenantData.orgLogo || "/_static/fundroom-icon.png",
    iconDark: tenantData.orgLogo || "/_static/fundroom-icon.png",
    faviconPath: "/icons/fundroom",
    primaryColor: tenantData.orgBrandColor || "#0A1628",
    accentColor: tenantData.orgAccentColor || "#0066FF",
  };

  return {
    brand: tenantBrand,
    isCustomBrand: true,
    tenantName: tenantData.orgName || null,
    tenantLogo: tenantData.orgLogo || null,
    tenantBrandColor: tenantData.orgBrandColor || null,
    tenantAccentColor: tenantData.orgAccentColor || null,
    tenantDescription: tenantData.orgDescription || null,
    loading,
  };
}
