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

interface ProofReceivedEmailProps {
  fundName: string;
  investorName: string;
  commitmentAmount: string;
  proofFileName: string;
  uploadedAt: string;
  proofNotes?: string;
  dashboardUrl: string;
}

export default function ProofReceivedEmail({
  fundName,
  investorName,
  commitmentAmount,
  proofFileName,
  uploadedAt,
  proofNotes,
  dashboardUrl,
}: ProofReceivedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Wire proof received from {investorName} for {fundName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Wire Proof of Payment Received</Heading>
          <Section style={section}>
            <Text style={text}>
              <strong>{investorName}</strong> has uploaded proof of wire
              transfer for <strong>{fundName}</strong>.
            </Text>
            <Text style={detailText}>
              Commitment: <strong>{commitmentAmount}</strong>
            </Text>
            <Text style={detailText}>
              File: <strong>{proofFileName}</strong>
            </Text>
            <Text style={detailText}>
              Uploaded: <strong>{uploadedAt}</strong>
            </Text>
            {proofNotes && (
              <Text style={notesText}>
                LP Notes: &ldquo;{proofNotes}&rdquo;
              </Text>
            )}
            <Text style={text}>
              Please review and verify this proof of payment in the{" "}
              <a href={dashboardUrl} style={link}>
                Wire Transfer Dashboard
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

const notesText = {
  margin: "12px 0",
  color: "#666",
  fontSize: "14px",
  lineHeight: "22px",
  fontStyle: "italic" as const,
  borderLeft: "3px solid #e2e8f0",
  paddingLeft: "12px",
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
