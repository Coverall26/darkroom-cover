import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface CrmDailyDigestEmailProps {
  recipientName: string;
  companyName: string;
  digestText: string;
  stats: {
    totalContacts: number;
    newContacts24h: number;
    emailsSent24h: number;
    emailsOpened24h: number;
    overdueFollowUps: number;
    hotLeads: number;
  };
  date: string;
}

export default function CrmDailyDigestEmail({
  recipientName,
  companyName,
  digestText,
  stats,
  date,
}: CrmDailyDigestEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        CRM Daily Digest — {date}
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Heading style={headingStyle}>
              Daily CRM Digest
            </Heading>
            <Text style={dateStyle}>{date}</Text>
          </Section>

          <Section style={sectionStyle}>
            <Text style={greetingStyle}>
              Hi {recipientName},
            </Text>
            <Text style={textStyle}>
              Here&apos;s your daily CRM summary for {companyName}.
            </Text>
          </Section>

          <Section style={metricsGridStyle}>
            <table style={metricsTableStyle} cellPadding="0" cellSpacing="0">
              <tbody>
                <tr>
                  <td style={metricCellStyle}>
                    <Text style={metricValueStyle}>{stats.totalContacts}</Text>
                    <Text style={metricLabelStyle}>Total Contacts</Text>
                  </td>
                  <td style={metricCellStyle}>
                    <Text style={metricValueStyle}>{stats.newContacts24h}</Text>
                    <Text style={metricLabelStyle}>New (24h)</Text>
                  </td>
                  <td style={metricCellStyle}>
                    <Text style={metricValueStyle}>{stats.emailsSent24h}</Text>
                    <Text style={metricLabelStyle}>Emails Sent</Text>
                  </td>
                </tr>
                <tr>
                  <td style={metricCellStyle}>
                    <Text style={metricValueStyle}>{stats.emailsOpened24h}</Text>
                    <Text style={metricLabelStyle}>Emails Opened</Text>
                  </td>
                  <td style={metricCellStyle}>
                    <Text style={metricValueStyle}>
                      <span style={stats.overdueFollowUps > 0 ? warningStyle : undefined}>
                        {stats.overdueFollowUps}
                      </span>
                    </Text>
                    <Text style={metricLabelStyle}>Overdue Follow-ups</Text>
                  </td>
                  <td style={metricCellStyle}>
                    <Text style={metricValueStyle}>
                      <span style={stats.hotLeads > 0 ? successStyle : undefined}>
                        {stats.hotLeads}
                      </span>
                    </Text>
                    <Text style={metricLabelStyle}>Hot Leads</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={digestSectionStyle}>
            <Heading as="h3" style={subheadingStyle}>
              AI Summary
            </Heading>
            <Text style={digestTextStyle}>{digestText}</Text>
          </Section>

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              This digest is sent daily as part of your AI CRM add-on.
              Manage preferences in Settings → Notifications.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f3f4f6",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  backgroundColor: "#0A1628",
  padding: "24px 32px",
};

const headingStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "20px",
  fontWeight: 600,
  margin: 0,
};

const dateStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "13px",
  margin: "4px 0 0",
};

const sectionStyle: React.CSSProperties = {
  padding: "24px 32px 8px",
};

const greetingStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#1f2937",
  margin: "0 0 8px",
};

const textStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#4b5563",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const metricsGridStyle: React.CSSProperties = {
  padding: "0 24px 16px",
};

const metricsTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const metricCellStyle: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "12px 8px",
  border: "1px solid #e5e7eb",
  borderRadius: "4px",
};

const metricValueStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 700,
  color: "#0A1628",
  fontFamily: '"JetBrains Mono", monospace',
  margin: "0 0 2px",
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: 0,
};

const warningStyle: React.CSSProperties = {
  color: "#F59E0B",
};

const successStyle: React.CSSProperties = {
  color: "#10B981",
};

const digestSectionStyle: React.CSSProperties = {
  padding: "16px 32px",
  borderTop: "1px solid #e5e7eb",
};

const subheadingStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#1f2937",
  margin: "0 0 8px",
};

const digestTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#374151",
  lineHeight: "1.7",
  whiteSpace: "pre-line" as const,
  margin: 0,
};

const footerStyle: React.CSSProperties = {
  padding: "16px 32px",
  borderTop: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
};

const footerTextStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  margin: 0,
};
