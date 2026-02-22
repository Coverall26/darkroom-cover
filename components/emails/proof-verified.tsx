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

interface ProofVerifiedEmailProps {
  fundName: string;
  investorName: string;
  commitmentAmount: string;
  verifiedAt: string;
  portalUrl: string;
}

export default function ProofVerifiedEmail({
  fundName,
  investorName,
  commitmentAmount,
  verifiedAt,
  portalUrl,
}: ProofVerifiedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Wire transfer verified for {fundName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Wire Transfer Verified</Heading>
          <Section style={section}>
            <Text style={text}>
              Dear {investorName},
            </Text>
            <Text style={text}>
              Your wire transfer proof for <strong>{fundName}</strong> has
              been verified by the fund administrator.
            </Text>
            <Text style={detailText}>
              Commitment: <strong>{commitmentAmount}</strong>
            </Text>
            <Text style={detailText}>
              Verified: <strong>{verifiedAt}</strong>
            </Text>
            <Text style={text}>
              Your investment has been marked as funded. You can view your
              investment details in the{" "}
              <a href={portalUrl} style={link}>
                Investor Portal
              </a>
              .
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

const detailText = {
  margin: "0 0 4px 0",
  color: "#484848",
  fontSize: "14px",
  lineHeight: "22px",
};

const link = {
  color: "#2563eb",
  textDecoration: "underline",
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
