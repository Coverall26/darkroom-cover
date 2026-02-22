import React from "react";

import {
  Body,
  Head,
  Html,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";

interface SixMonthMilestoneEmailProps {
  name: string | null | undefined;
  planName?: string;
}

const SixMonthMilestoneEmail = ({
  name,
  planName = "Pro",
}: SixMonthMilestoneEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>6 months with FundRoom</Preview>
      <Tailwind>
        <Body className="font-sans text-sm">
          <Text>Hi {name},</Text>
          <Text>What&apos;s been your biggest win using FundRoom?</Text>
          <Text>
            It&apos;s been 6 months since you started using advanced
            features! We&apos;d love to hear your story and feedback.
          </Text>

          <Text>The FundRoom Team</Text>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default SixMonthMilestoneEmail;
