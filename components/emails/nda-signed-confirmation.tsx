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

interface NdaSignedConfirmationEmailProps {
  investorName: string;
  fundName: string;
  signedAt: string;
  portalUrl: string;
}

export default function NdaSignedConfirmationEmail({
  investorName = "Investor",
  fundName = "Sample Fund I",
  signedAt = new Date().toLocaleDateString("en-US"),
  portalUrl = "https://app.fundroom.ai/lp/dashboard",
}: NdaSignedConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>
        NDA signed — {fundName}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>NDA Accepted</Heading>

          <Section style={section}>
            <Text style={text}>Dear {investorName},</Text>
            <Text style={text}>
              Thank you for accepting the Non-Disclosure and Confidentiality
              Agreement for <strong>{fundName}</strong>. Your acceptance has been
              recorded and timestamped for compliance purposes.
            </Text>

            <Text style={detailText}>
              <strong>Fund:</strong> {fundName}
            </Text>
            <Text style={detailText}>
              <strong>Signed:</strong> {signedAt}
            </Text>

            <Text style={text}>
              You may now continue with the investor onboarding process. Visit
              your{" "}
              <a href={portalUrl} style={link}>
                investor portal
              </a>{" "}
              to proceed to the next step.
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

const link = { color: "#2563eb", textDecoration: "underline" as const };

const brandFooter = {
  backgroundColor: "#f9fafb",
  padding: "16px 24px",
  textAlign: "center" as const,
  borderTop: "1px solid #e5e7eb",
};

const brandFooterText = { fontSize: "12px", color: "#9ca3af" };
