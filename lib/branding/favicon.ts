export type BrandKey = "fundroom";

export interface BrandConfig {
  key: BrandKey;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  logoLight: string;
  logoDark: string;
  iconLight: string;
  iconDark: string;
  faviconPath: string;
  primaryColor: string;
  accentColor: string;
}

const PLATFORM_BRAND: BrandConfig = {
  key: "fundroom",
  name: "FundRoom AI",
  shortName: "FundRoom",
  tagline: "Connecting Capital and Opportunity.",
  description: "Secure investor portals and datarooms for funds and startups",
  logoLight: "/_static/fundroom-logo-black.png",
  logoDark: "/_static/fundroom-logo-white.png",
  iconLight: "/_static/fundroom-icon.png",
  iconDark: "/_static/fundroom-icon.png",
  faviconPath: "/icons/fundroom",
  primaryColor: "#0A1628",
  accentColor: "#0066FF",
};

/**
 * Returns the platform brand. Tenant-specific branding is resolved
 * from the database (Brand model per team), not from hardcoded config.
 */
export function getBrandFromHost(_host: string | null | undefined): BrandKey {
  return "fundroom";
}

export function getBrandConfig(_brand: BrandKey): BrandConfig {
  return PLATFORM_BRAND;
}

export function getIconPath(brand: BrandKey): string {
  return `/icons/${brand}`;
}

export function getFaviconUrl(brand: BrandKey): string {
  return `/icons/${brand}/favicon.png`;
}

export function getAppleTouchIconUrl(brand: BrandKey): string {
  return `/icons/${brand}/apple-touch-icon.png`;
}

export function getIconUrl(brand: BrandKey, size: number): string {
  return `/icons/${brand}/icon-${size}x${size}.png`;
}

export function getBrandManifestIcons(brand: BrandKey) {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  return sizes.map((s) => ({
    src: `/icons/${brand}/icon-${s}x${s}.png`,
    sizes: `${s}x${s}`,
    type: "image/png",
    purpose: "any maskable",
  }));
}

export function getBrandName(brand: BrandKey): string {
  return PLATFORM_BRAND.name;
}

export const FUNDROOM_SIGNATURE_LOGO = "/_static/fundroom-signature.png";
export const FUNDROOM_ICON = "/_static/fundroom-icon.png";
