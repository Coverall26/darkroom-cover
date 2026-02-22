/**
 * Profile Completeness Calculator
 *
 * Calculates a 0-100% completeness score for an organization's profile
 * based on filled fields across Company Info, Branding, Fund, and LP Onboarding.
 *
 * Used for:
 * - GP dashboard profile strength indicator
 * - Marketplace listing quality gate (min 75% to publish)
 * - Settings center completeness prompt
 */

interface ProfileInput {
  organization: {
    name?: string | null;
    entityType?: string | null;
    ein?: string | null;
    phone?: string | null;
    addressLine1?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressZip?: string | null;
    addressCountry?: string | null;
    companyDescription?: string | null;
    sector?: string | null;
    geography?: string | null;
    website?: string | null;
    foundedYear?: number | null;
    regulationDExemption?: string | null;
    productMode?: string | null;
  };
  brand?: {
    logo?: string | null;
    brandColor?: string | null;
    accentColor?: string | null;
  } | null;
  fund?: {
    name?: string | null;
    targetRaise?: number | string | null;
    fundType?: string | null;
    waterfallType?: string | null;
    managementFeePct?: number | string | null;
    carryPct?: number | string | null;
    marketplaceInterest?: boolean | null;
    marketplaceDescription?: string | null;
    marketplaceCategory?: string | null;
  } | null;
  orgDefaults?: {
    accreditationMethod?: string | null;
    allowExternalDocUpload?: boolean | null;
  } | null;
}

interface ProfileCompletenessResult {
  /** Overall score 0-100 */
  score: number;
  /** Per-category breakdown */
  categories: {
    companyInfo: { score: number; total: number; filled: number };
    branding: { score: number; total: number; filled: number };
    fundDetails: { score: number; total: number; filled: number };
    lpOnboarding: { score: number; total: number; filled: number };
  };
  /** Fields that are missing */
  missingFields: string[];
  /** Tier label */
  tier: "incomplete" | "basic" | "good" | "excellent";
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return true;
  if (typeof value === "boolean") return true;
  return false;
}

export function calculateProfileCompleteness(
  input: ProfileInput,
): ProfileCompletenessResult {
  const missingFields: string[] = [];

  // --- Company Info (weight: 40%) ---
  const companyFields = [
    { key: "name", value: input.organization.name, label: "Company name" },
    { key: "entityType", value: input.organization.entityType, label: "Entity type" },
    { key: "ein", value: input.organization.ein, label: "EIN/Tax ID" },
    { key: "phone", value: input.organization.phone, label: "Phone number" },
    { key: "addressLine1", value: input.organization.addressLine1, label: "Business address" },
    { key: "addressCity", value: input.organization.addressCity, label: "City" },
    { key: "addressState", value: input.organization.addressState, label: "State" },
    { key: "addressZip", value: input.organization.addressZip, label: "ZIP code" },
    { key: "companyDescription", value: input.organization.companyDescription, label: "Company description" },
    { key: "sector", value: input.organization.sector, label: "Sector" },
    { key: "website", value: input.organization.website, label: "Website" },
    { key: "regulationDExemption", value: input.organization.regulationDExemption, label: "Regulation D exemption" },
  ];
  const companyFilled = companyFields.filter((f) => isFilled(f.value)).length;
  companyFields.filter((f) => !isFilled(f.value)).forEach((f) => missingFields.push(f.label));

  // --- Branding (weight: 15%) ---
  const brandingFields = [
    { key: "logo", value: input.brand?.logo, label: "Logo" },
    { key: "brandColor", value: input.brand?.brandColor, label: "Brand color" },
    { key: "accentColor", value: input.brand?.accentColor, label: "Accent color" },
  ];
  const brandingFilled = brandingFields.filter((f) => isFilled(f.value)).length;
  brandingFields.filter((f) => !isFilled(f.value)).forEach((f) => missingFields.push(f.label));

  // --- Fund Details (weight: 30%) ---
  const fundFields = [
    { key: "fundName", value: input.fund?.name, label: "Fund name" },
    { key: "targetRaise", value: input.fund?.targetRaise, label: "Target raise" },
    { key: "fundType", value: input.fund?.fundType, label: "Fund type" },
    { key: "waterfallType", value: input.fund?.waterfallType, label: "Waterfall type" },
    { key: "managementFeePct", value: input.fund?.managementFeePct, label: "Management fee" },
    { key: "carryPct", value: input.fund?.carryPct, label: "Carried interest" },
  ];
  const fundFilled = fundFields.filter((f) => isFilled(f.value)).length;
  fundFields.filter((f) => !isFilled(f.value)).forEach((f) => missingFields.push(f.label));

  // --- LP Onboarding (weight: 15%) ---
  const lpFields = [
    { key: "accreditationMethod", value: input.orgDefaults?.accreditationMethod, label: "Accreditation method" },
    { key: "allowExternalDocUpload", value: input.orgDefaults?.allowExternalDocUpload, label: "External doc upload setting" },
  ];
  const lpFilled = lpFields.filter((f) => isFilled(f.value)).length;
  lpFields.filter((f) => !isFilled(f.value)).forEach((f) => missingFields.push(f.label));

  // Weighted score
  const companyScore = companyFields.length > 0 ? (companyFilled / companyFields.length) * 100 : 100;
  const brandingScore = brandingFields.length > 0 ? (brandingFilled / brandingFields.length) * 100 : 100;
  const fundScore = fundFields.length > 0 ? (fundFilled / fundFields.length) * 100 : 100;
  const lpScore = lpFields.length > 0 ? (lpFilled / lpFields.length) * 100 : 100;

  const score = Math.round(
    companyScore * 0.4 +
    brandingScore * 0.15 +
    fundScore * 0.30 +
    lpScore * 0.15,
  );

  let tier: ProfileCompletenessResult["tier"] = "incomplete";
  if (score >= 90) tier = "excellent";
  else if (score >= 70) tier = "good";
  else if (score >= 40) tier = "basic";

  return {
    score,
    categories: {
      companyInfo: { score: Math.round(companyScore), total: companyFields.length, filled: companyFilled },
      branding: { score: Math.round(brandingScore), total: brandingFields.length, filled: brandingFilled },
      fundDetails: { score: Math.round(fundScore), total: fundFields.length, filled: fundFilled },
      lpOnboarding: { score: Math.round(lpScore), total: lpFields.length, filled: lpFilled },
    },
    missingFields,
    tier,
  };
}
