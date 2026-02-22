"use client";

/**
 * FaviconSwitcher - No-op component.
 *
 * Tenant-specific branding (logos, favicons) is now resolved from the
 * database via the Brand model per team. The platform always uses the
 * FundRoom favicon by default. Custom tenant favicons should be served
 * via the Brand model's logo/banner fields.
 */
export function FaviconSwitcher() {
  return null;
}
