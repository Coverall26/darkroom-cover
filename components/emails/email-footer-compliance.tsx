/**
 * CAN-SPAM compliant email footer component.
 *
 * Includes: physical mailing address, visible unsubscribe link,
 * and org branding. Required for all CRM outreach / marketing emails.
 * Transactional emails (password reset, wire confirmation, etc.)
 * do NOT require this footer.
 */

import React from "react";
import { Section, Text, Link } from "@react-email/components";

export interface ComplianceFooterProps {
  /** Organization display name */
  orgName: string;
  /** Physical address lines */
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
  };
  /** One-click unsubscribe URL (CAN-SPAM + RFC 8058) */
  unsubscribeUrl?: string;
  /** Optional brand color for links (defaults to Electric Blue) */
  brandColor?: string;
}

export function EmailFooterCompliance({
  orgName,
  address,
  unsubscribeUrl,
  brandColor = "#0066FF",
}: ComplianceFooterProps) {
  // Format address per CAN-SPAM (street, city, state ZIP, country)
  const addressParts: string[] = [];
  if (address?.line1) addressParts.push(address.line1);
  if (address?.line2) addressParts.push(address.line2);

  const cityStateZip = [
    address?.city,
    address?.state ? `${address.state}${address?.zip ? ` ${address.zip}` : ""}` : address?.zip,
  ]
    .filter(Boolean)
    .join(", ");
  if (cityStateZip) addressParts.push(cityStateZip);

  if (address?.country && address.country !== "US") {
    addressParts.push(address.country);
  }

  return (
    <Section style={footerSection}>
      {/* Divider */}
      <div style={divider} />

      {/* Org name + physical address (CAN-SPAM requirement) */}
      <Text style={orgNameStyle}>{orgName}</Text>
      {addressParts.length > 0 && (
        <Text style={addressStyle}>
          {addressParts.join(" · ")}
        </Text>
      )}

      {/* Unsubscribe link (CAN-SPAM requirement for marketing/outreach emails) */}
      {unsubscribeUrl && (
        <Text style={unsubscribeText}>
          You received this email because you are in our CRM.{" "}
          <Link href={unsubscribeUrl} style={{ ...linkStyle, color: brandColor }}>
            Unsubscribe
          </Link>{" "}
          from future outreach emails.
        </Text>
      )}

      {/* Platform branding */}
      <Text style={poweredByStyle}>
        Powered by{" "}
        <Link href="https://fundroom.ai" style={poweredByLink}>
          FundRoom
        </Link>
      </Text>
    </Section>
  );
}

/**
 * Generates raw HTML compliance footer string for wrapping around
 * outreach email HTML bodies that don't use React Email components.
 */
export function buildComplianceFooterHtml(props: ComplianceFooterProps): string {
  const { orgName, address, unsubscribeUrl } = props;

  const addressParts: string[] = [];
  if (address?.line1) addressParts.push(address.line1);
  if (address?.line2) addressParts.push(address.line2);

  const cityStateZip = [
    address?.city,
    address?.state ? `${address.state}${address?.zip ? ` ${address.zip}` : ""}` : address?.zip,
  ]
    .filter(Boolean)
    .join(", ");
  if (cityStateZip) addressParts.push(cityStateZip);

  if (address?.country && address.country !== "US") {
    addressParts.push(address.country);
  }

  const addressLine = addressParts.length > 0
    ? `<p style="margin:0;padding:0;font-size:11px;line-height:16px;color:#999">${escapeHtml(addressParts.join(" &middot; "))}</p>`
    : "";

  const unsubLine = unsubscribeUrl
    ? `<p style="margin:4px 0 0;font-size:11px;line-height:16px;color:#999">You received this email because you are in our CRM. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#0066FF;text-decoration:underline">Unsubscribe</a> from future outreach emails.</p>`
    : "";

  return `
<div style="border-top:1px solid #eee;margin-top:32px;padding-top:16px;text-align:center">
  <p style="margin:0;padding:0;font-size:12px;font-weight:600;color:#666">${escapeHtml(orgName)}</p>
  ${addressLine}
  ${unsubLine}
  <p style="margin:8px 0 0;font-size:10px;color:#bbb">Powered by <a href="https://fundroom.ai" style="color:#bbb;text-decoration:none">FundRoom</a></p>
</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Styles (inline for email compatibility)
// ---------------------------------------------------------------------------

const footerSection: React.CSSProperties = {
  borderTop: "1px solid #eee",
  marginTop: "32px",
  paddingTop: "16px",
  textAlign: "center" as const,
};

const divider: React.CSSProperties = {
  display: "none",
};

const orgNameStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  fontSize: "12px",
  fontWeight: 600,
  color: "#666",
  lineHeight: "18px",
};

const addressStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  fontSize: "11px",
  lineHeight: "16px",
  color: "#999",
};

const unsubscribeText: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: "11px",
  lineHeight: "16px",
  color: "#999",
};

const linkStyle: React.CSSProperties = {
  textDecoration: "underline",
};

const poweredByStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: "10px",
  color: "#bbb",
};

const poweredByLink: React.CSSProperties = {
  color: "#bbb",
  textDecoration: "none",
};
