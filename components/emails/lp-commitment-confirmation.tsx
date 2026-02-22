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

interface LpCommitmentConfirmationEmailProps {
  investorName: string;
  fundName: string;
  commitmentAmount: string;
  units: number | null;
  commitDate: string;
  portalUrl: string;
}

export default function LpCommitmentConfirmationEmail({
  investorName = "Investor",
  fundName = "Sample Fund I",
  commitmentAmount = "$100,000.00",
  units = null,
  commitDate = new Date().toLocaleDateString("en-US"),
  portalUrl = "https://app.fundroom.ai/lp/dashboard",
}: LpCommitmentConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        Commitment received — {fundName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Commitment Received</Heading>

          <Section style={section}>
            <Text style={text}>Dear {investorName},</Text>
            <Text style={text}>
              Your investment commitment for <strong>{fundName}</strong> has been
              received and recorded. The general partner will review your
              submission.
            </Text>

            <Text style={detailText}>
              <strong>Fund:</strong> {fundName}
            </Text>
            <Text style={detailText}>
              <strong>Commitment:</strong> {commitmentAmount}
            </Text>
            {units && (
              <Text style={detailText}>
                <strong>Units:</strong> {units}
              </Text>
            )}
            <Text style={detailText}>
              <strong>Date:</strong> {commitDate}
            </Text>

            <Text style={noteText}>
              Next steps: Please follow the wire instructions provided in your{" "}
              <a href={portalUrl} style={link}>
                investor portal
              </a>{" "}
              to fund your commitment. Once funds are received, the general
              partner will confirm receipt and update your investment status.
            </Text>
          </Section>

          <Section style={brandFooter}>
            <Text style={brandFooterText}>
              Powered by FundRoom — secure fund operations platform.
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

const section = { padding: "24px" };

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
  margin: "16px 0 0 0",
  color: "#484848",
  fontSize: "14px",
  lineHeight: "22px",
};

const link = { color: "#2563eb", textDecoration: "underline" as const };

const brandFooter = {
  backgroundColor: "#f9fafb",
  padding: "16px 24px",
  textAlign: "center" as const,
  borderTop: "1px solid #e5e7eb",
};

const brandFooterText = { fontSize: "12px", color: "#9ca3af" };
