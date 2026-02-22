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

interface DocumentUploadNotificationProps {
  lpEmail: string;
  documentTitle: string;
  documentType: string;
  portalUrl: string;
}

export function DocumentUploadNotification({
  lpEmail,
  documentTitle,
  documentType,
  portalUrl,
}: DocumentUploadNotificationProps) {
  return (
    <Html>
      <Head />
      <Preview>
        New document uploaded by {lpEmail} — {documentType}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Heading style={heading}>New Document Uploaded</Heading>
            <Text style={text}>
              An investor has uploaded a new document that requires your review.
            </Text>
            <Section style={detailsBox}>
              <Text style={detailLabel}>Uploaded by</Text>
              <Text style={detailValue}>{lpEmail}</Text>
              <Text style={detailLabel}>Document</Text>
              <Text style={detailValue}>{documentTitle}</Text>
              <Text style={detailLabel}>Type</Text>
              <Text style={detailValue}>{documentType}</Text>
            </Section>
            <Text style={text}>
              Please review this document and approve, reject, or request a
              revision.
            </Text>
            <Button style={button} href={portalUrl}>
              Review Document
            </Button>
          </Section>
          <Text style={footer}>Powered by FundRoom</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "580px",
};

const section = {
  padding: "0 48px",
};

const heading = {
  fontSize: "24px",
  letterSpacing: "-0.5px",
  lineHeight: "1.3",
  fontWeight: "700",
  color: "#0A1628",
  padding: "17px 0 0",
};

const text = {
  margin: "0 0 16px",
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#484848",
};

const detailsBox = {
  backgroundColor: "#f8f9fa",
  borderRadius: "8px",
  padding: "16px 20px",
  margin: "16px 0",
  border: "1px solid #e9ecef",
};

const detailLabel = {
  fontSize: "12px",
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 2px",
};

const detailValue = {
  fontSize: "15px",
  color: "#0A1628",
  fontWeight: "600",
  margin: "0 0 12px",
};

const button = {
  backgroundColor: "#0066FF",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  margin: "24px 0",
};

const footer = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  padding: "0 48px",
  marginTop: "24px",
};
