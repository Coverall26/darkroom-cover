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

interface GpNewCommitmentEmailProps {
  fundName: string;
  investorName: string;
  commitmentAmount: string;
  units?: number | null;
  pricePerUnit?: string;
  commitDate: string;
  dashboardUrl: string;
}

export default function GpNewCommitmentEmail({
  fundName,
  investorName,
  commitmentAmount,
  units,
  pricePerUnit,
  commitDate,
  dashboardUrl,
}: GpNewCommitmentEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        New commitment from {investorName} for {fundName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>New Investment Commitment</Heading>
          <Section style={section}>
            <Text style={text}>
              <strong>{investorName}</strong> has committed to invest in{" "}
              <strong>{fundName}</strong>.
            </Text>
            <Text style={detailText}>
              Commitment Amount: <strong>{commitmentAmount}</strong>
            </Text>
            {units && pricePerUnit && (
              <Text style={detailText}>
                Units: <strong>{units.toLocaleString()}</strong> at{" "}
                <strong>{pricePerUnit}</strong>/unit
              </Text>
            )}
            <Text style={detailText}>
              Date: <strong>{commitDate}</strong>
            </Text>
            <Text style={actionText}>
              Next steps: Review the investor in your{" "}
              <a href={dashboardUrl} style={link}>
                Investor Pipeline
              </a>{" "}
              and confirm their commitment details.
            </Text>
          </Section>
          <Section style={brandFooter}>
            <Text style={brandFooterText}>Powered by FundRoom</Text>
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

const actionText = {
  margin: "16px 0 0 0",
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
