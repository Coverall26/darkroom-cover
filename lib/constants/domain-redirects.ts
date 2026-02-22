/**
 * Legacy tenant domain root redirects.
 *
 * These define where a tenant custom domain's "/" path should redirect.
 * Moving these from hardcoded middleware to a config file makes it possible
 * to add/modify redirects without code deployments.
 *
 * Phase 2: Migrate to a `domain_redirects` database table.
 */
export const TENANT_ROOT_REDIRECTS: Record<string, string> = {
  "guide.permithealth.com": "https://guide.permithealth.com/faq",
  "fund.tradeair.in": "https://tradeair.in/sv-fm-inbound",
  "docs.pashupaticapital.com": "https://www.pashupaticapital.com/",
  "partners.braxtech.net": "https://partners.braxtech.net/investors",
};
