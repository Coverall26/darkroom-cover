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

interface DocumentReviewNotificationProps {
  investorName: string;
  documentTitle: string;
  documentType: string;
  fundName: string;
  reviewStatus: "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  reviewNotes?: string;
  reviewerName?: string;
  portalUrl: string;
}

const STATUS_LABELS: Record<string, { heading: string; message: string }> = {
  APPROVED: {
    heading: "Document Approved",
    message:
      "Your document has been reviewed and approved by the fund administrator. No further action is needed for this document.",
  },
  REJECTED: {
    heading: "Document Not Accepted",
    message:
      "Unfortunately, your document was not accepted. Please review the notes below and contact your fund administrator if you have questions.",
  },
  REVISION_REQUESTED: {
    heading: "Document Revision Requested",
    message:
      "The fund administrator has requested changes to your document. Please review the notes below and upload a revised version.",
  },
};

export default function DocumentReviewNotification({
  investorName,
  documentTitle,
  documentType,
  fundName,
  reviewStatus,
  reviewNotes,
  reviewerName,
  portalUrl,
}: DocumentReviewNotificationProps) {
  const statusInfo = STATUS_LABELS[reviewStatus] || STATUS_LABELS.APPROVED;

  return (
    <Html>
      <Head />
      <Preview>
        {statusInfo.heading}: {documentTitle} for {fundName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{statusInfo.heading}</Heading>
          <Section style={section}>
            <Text style={text}>Hi {investorName},</Text>
            <Text style={text}>{statusInfo.message}</Text>
            <Text style={detailText}>
              <strong>Document:</strong> {documentTitle}
            </Text>
            <Text style={detailText}>
              <strong>Type:</strong> {documentType.replace(/_/g, " ")}
            </Text>
            <Text style={detailText}>
              <strong>Fund:</strong> {fundName}
            </Text>
            {reviewNotes && (
              <>
                <Text style={notesLabel}>
                  <strong>
                    {reviewStatus === "REVISION_REQUESTED"
                      ? "Requested Changes:"
                      : "Reviewer Notes:"}
                  </strong>
                </Text>
                <Text style={notesText}>{reviewNotes}</Text>
              </>
            )}
            {reviewerName && (
              <Text style={detailText}>
                <strong>Reviewed by:</strong> {reviewerName}
              </Text>
            )}
            <Button
              style={
                reviewStatus === "REVISION_REQUESTED" ? buttonOrange : button
              }
              href={portalUrl}
            >
              {reviewStatus === "REVISION_REQUESTED"
                ? "Upload Revised Document"
                : "Go to Document Vault"}
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

const detailText = {
  margin: "0 0 4px 0",
  color: "#484848",
  fontSize: "14px",
  lineHeight: "20px",
};

const notesLabel = {
  margin: "16px 0 4px 0",
  color: "#484848",
  fontSize: "14px",
  lineHeight: "20px",
};

const notesText = {
  margin: "0 0 12px 0",
  color: "#484848",
  fontSize: "14px",
  lineHeight: "22px",
  backgroundColor: "#f8f9fa",
  padding: "12px 16px",
  borderRadius: "6px",
  borderLeft: "3px solid #e2e8f0",
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

const buttonOrange = {
  backgroundColor: "#ea580c",
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
