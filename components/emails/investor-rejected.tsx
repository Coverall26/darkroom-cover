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

interface InvestorRejectedEmailProps {
  investorName: string;
  fundName: string;
  gpFirmName: string;
  reason?: string;
}

export default function InvestorRejectedEmail({
  investorName,
  fundName,
  gpFirmName,
  reason,
}: InvestorRejectedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Update regarding your {fundName} application
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Application Update</Heading>
          <Section style={section}>
            <Text style={text}>Hi {investorName},</Text>
            <Text style={text}>
              We regret to inform you that your application to invest in{" "}
              <strong>{fundName}</strong> was not approved by{" "}
              <strong>{gpFirmName}</strong> at this time.
            </Text>
            {reason && (
              <>
                <Text style={reasonLabel}>Reason:</Text>
                <Text style={reasonText}>{reason}</Text>
              </>
            )}
            <Text style={text}>
              If you have questions about this decision, please contact your
              fund administrator directly.
            </Text>
            <Text style={footerText}>
              Thank you for your interest.
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

const reasonLabel = {
  margin: "16px 0 4px 0",
  color: "#484848",
  fontSize: "14px",
  fontWeight: "600" as const,
  lineHeight: "20px",
};

const reasonText = {
  margin: "0 0 16px 0",
  color: "#666",
  fontSize: "14px",
  lineHeight: "20px",
  backgroundColor: "#FEF2F2",
  borderLeft: "3px solid #EF4444",
  padding: "12px 16px",
  borderRadius: "0 4px 4px 0",
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
