import React from "react";

import {
  Body,
  Head,
  Html,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";

interface UpgradePersonalEmailProps {
  name: string | null | undefined;
  planName?: string;
}

const UpgradePersonalEmail = ({
  name,
  planName = "Pro",
}: UpgradePersonalEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Welcome to {planName}</Preview>
      <Tailwind>
        <Body className="font-sans text-sm">
          <Text>Hi{name && ` ${name}`},</Text>
          <Text>
            Welcome to FundRoom! Thanks for upgrading!
            We&apos;re thrilled to have you on our {planName} plan.
          </Text>
          <Text>
            You now have access to advanced features. If you have any questions,
            please reach out to support@fundroom.ai.
          </Text>
          <Text>The FundRoom Team</Text>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default UpgradePersonalEmail;
