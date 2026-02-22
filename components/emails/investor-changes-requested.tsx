import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface InvestorChangesRequestedEmailProps {
  investorName: string;
  fundName: string;
  gpFirmName: string;
  flaggedFields: Array<{ fieldName: string; reason: string }>;
  generalNotes?: string;
  portalUrl: string;
}

export default function InvestorChangesRequestedEmail({
  investorName,
  fundName,
  gpFirmName,
  flaggedFields,
  generalNotes,
  portalUrl,
}: InvestorChangesRequestedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Changes requested for your {fundName} submission
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Changes Requested</Heading>
          <Section style={section}>
            <Text style={text}>Hi {investorName},</Text>
            <Text style={text}>
              <strong>{gpFirmName}</strong> has reviewed your submission for{" "}
              <strong>{fundName}</strong> and has requested the following
              changes:
            </Text>

            {flaggedFields.map((field, idx) => (
              <div key={idx} style={fieldRow}>
                <Text style={fieldName}>{field.fieldName}</Text>
                <Text style={fieldReason}>{field.reason}</Text>
              </div>
            ))}

            {generalNotes && (
              <>
                <Text style={notesLabel}>Additional Notes:</Text>
                <Text style={notesText}>{generalNotes}</Text>
              </>
            )}

            <Text style={text}>
              Please review the requested changes and re-submit your updated
              information.
            </Text>
            <Button style={button} href={portalUrl}>
              Review & Re-submit
            </Button>
            <Text style={footerText}>
              If you have questions, please contact your fund administrator.
            </Text>
          </Section>
          <Section style={brandFooter}>
            <Text style={brandFooterText}>
              Powered by FundRoom
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
};

const heading = {
  fontSize: "24px",
  letterSpacing: "-0.5px",
  lineHeight: "1.3",
  fontWeight: "400",
  color: "#484848",
  padding: "17px 0 0",
};

const section = {
  padding: "24px",
};

const text = {
  margin: "0 0 10px 0",
  color: "#484848",
  fontSize: "15px",
  lineHeight: "24px",
};

const fieldRow = {
  backgroundColor: "#FEF3C7",
  borderLeft: "3px solid #F59E0B",
  padding: "12px 16px",
  marginBottom: "8px",
  borderRadius: "0 4px 4px 0",
};

const fieldName = {
  margin: "0 0 4px 0",
  color: "#92400E",
  fontSize: "14px",
  fontWeight: "600" as const,
  lineHeight: "20px",
};

const fieldReason = {
  margin: "0",
  color: "#78350F",
  fontSize: "13px",
  lineHeight: "18px",
};

const notesLabel = {
  margin: "16px 0 4px 0",
  color: "#484848",
  fontSize: "14px",
  fontWeight: "600" as const,
  lineHeight: "20px",
};

const notesText = {
  margin: "0 0 16px 0",
  color: "#666",
  fontSize: "14px",
  lineHeight: "20px",
  backgroundColor: "#f9fafb",
  padding: "12px",
  borderRadius: "4px",
};

const button = {
  backgroundColor: "#F59E0B",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  margin: "24px 0",
};

const footerText = {
  margin: "24px 0 0 0",
  color: "#999",
  fontSize: "13px",
  lineHeight: "20px",
};

const brandFooter = {
  backgroundColor: "#f9fafb",
  padding: "16px 24px",
  textAlign: "center" as const,
  borderTop: "1px solid #e5e7eb",
};

const brandFooterText = {
  fontSize: "12px",
  color: "#9ca3af",
  margin: "0",
};
