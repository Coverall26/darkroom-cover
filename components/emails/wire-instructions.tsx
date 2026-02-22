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

interface WireInstructionsEmailProps {
  investorName: string;
  fundName: string;
  commitmentAmount: string;
  bankName: string;
  accountName: string;
  routingNumber: string;
  accountNumber: string;
  reference: string;
  notes?: string;
  portalUrl: string;
}

export default function WireInstructionsEmail({
  investorName,
  fundName,
  commitmentAmount,
  bankName,
  accountName,
  routingNumber,
  accountNumber,
  reference,
  notes,
  portalUrl,
}: WireInstructionsEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Wire instructions for your {fundName} investment
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Wire Transfer Instructions</Heading>
          <Section style={section}>
            <Text style={text}>Hi {investorName},</Text>
            <Text style={text}>
              Thank you for your commitment of{" "}
              <strong>{commitmentAmount}</strong> to{" "}
              <strong>{fundName}</strong>. Below are the wire transfer
              instructions for your investment.
            </Text>

            <Section style={wireBox}>
              <Text style={wireLabel}>Bank Name</Text>
              <Text style={wireValue}>{bankName}</Text>

              <Text style={wireLabel}>Account Name</Text>
              <Text style={wireValue}>{accountName}</Text>

              <Text style={wireLabel}>Routing Number</Text>
              <Text style={wireValue}>{routingNumber}</Text>

              <Text style={wireLabel}>Account Number</Text>
              <Text style={wireValue}>{accountNumber}</Text>

              <Text style={wireLabel}>Reference / Memo</Text>
              <Text style={wireValue}>{reference}</Text>
            </Section>

            {notes && (
              <Text style={notesStyle}>{notes}</Text>
            )}

            <Text style={text}>
              After completing your wire transfer, please upload proof of
              payment in your{" "}
              <a href={portalUrl} style={link}>
                investor portal
              </a>
              . This helps us verify and process your investment faster.
            </Text>

            <Text style={warningText}>
              Please double-check all wire details before initiating the
              transfer. If you have questions, contact your fund administrator
              before wiring.
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

const wireBox = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
};

const wireLabel = {
  margin: "8px 0 0 0",
  color: "#94a3b8",
  fontSize: "12px",
  fontWeight: "600" as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const wireValue = {
  margin: "2px 0 8px 0",
  color: "#1e293b",
  fontSize: "15px",
  fontWeight: "500" as const,
  fontFamily: "monospace",
};

const notesStyle = {
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

const warningText = {
  margin: "16px 0 0 0",
  color: "#b45309",
  fontSize: "13px",
  lineHeight: "20px",
  backgroundColor: "#fefce8",
  padding: "12px",
  borderRadius: "6px",
  border: "1px solid #fde68a",
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
