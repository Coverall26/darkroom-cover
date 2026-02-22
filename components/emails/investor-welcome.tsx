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

interface InvestorWelcomeEmailProps {
  investorName: string;
  fundName: string;
  gpFirmName: string;
  portalUrl: string;
}

export default function InvestorWelcomeEmail({
  investorName,
  fundName,
  gpFirmName,
  portalUrl,
}: InvestorWelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Welcome to {fundName} — Your investor portal is ready
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Welcome to {fundName}</Heading>
          <Section style={section}>
            <Text style={text}>Hi {investorName},</Text>
            <Text style={text}>
              Thank you for your interest in <strong>{fundName}</strong>,
              managed by <strong>{gpFirmName}</strong>. Your investor account
              has been created and your portal is ready.
            </Text>
            <Text style={text}>Here&apos;s what you can do next:</Text>
            <Text style={listText}>1. Review the fund documents in the dataroom</Text>
            <Text style={listText}>2. Complete your accreditation verification</Text>
            <Text style={listText}>3. Sign the subscription agreement when ready</Text>
            <Text style={listText}>4. Wire your investment and upload proof of payment</Text>
            <Button style={button} href={portalUrl}>
              Access Your Investor Portal
            </Button>
            <Text style={footerText}>
              If you have questions, reply to this email or contact your fund
              administrator.
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

const listText = {
  margin: "0 0 4px 0",
  color: "#484848",
  fontSize: "14px",
  lineHeight: "22px",
  paddingLeft: "8px",
};

const button = {
  backgroundColor: "#0066FF",
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
