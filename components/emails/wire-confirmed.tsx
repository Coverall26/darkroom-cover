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

interface WireConfirmedEmailProps {
  fundName: string;
  investorName: string;
  amountReceived: string;
  fundsReceivedDate: string;
  bankReference?: string;
  confirmationNotes?: string;
  portalUrl: string;
}

export default function WireConfirmedEmail({
  fundName,
  investorName,
  amountReceived,
  fundsReceivedDate,
  bankReference,
  confirmationNotes,
  portalUrl,
}: WireConfirmedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Funds received for {fundName} — {amountReceived}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Funds Received</Heading>
          <Section style={section}>
            <Text style={text}>Dear {investorName},</Text>
            <Text style={text}>
              We are pleased to confirm that your wire transfer for{" "}
              <strong>{fundName}</strong> has been received and verified by the
              fund administrator.
            </Text>
            <Text style={detailText}>
              Amount Received: <strong>{amountReceived}</strong>
            </Text>
            <Text style={detailText}>
              Date Received: <strong>{fundsReceivedDate}</strong>
            </Text>
            {bankReference && (
              <Text style={detailText}>
                Bank Reference: <strong>{bankReference}</strong>
              </Text>
            )}
            {confirmationNotes && (
              <Text style={noteText}>{confirmationNotes}</Text>
            )}
            <Text style={text}>
              Your investment has been marked as funded. You can view your
              updated investment details in the{" "}
              <a href={portalUrl} style={link}>
                Investor Portal
              </a>
              .
            </Text>
            <Text style={text}>
              If you have any questions, please contact the fund administrator
              directly.
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

const noteText = {
  margin: "12px 0",
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "22px",
  fontStyle: "italic" as const,
  borderLeft: "3px solid #e5e7eb",
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
