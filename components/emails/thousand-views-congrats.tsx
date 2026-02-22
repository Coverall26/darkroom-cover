import React from "react";

import {
  Body,
  Head,
  Html,
  Link,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";

interface ThousandViewsCongratsEmailProps {
  name: string | null | undefined;
}

const ThousandViewsCongratsEmail = ({
  name,
}: ThousandViewsCongratsEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>1000 views on FundRoom.</Preview>
      <Tailwind>
        <Body className="font-sans text-sm">
          <Text>Hi{name && ` ${name}`},</Text>
          <Text>
            Congratulations on reaching 1000 views on your documents in the FundRoom!
          </Text>
          <Text>We hope you&apos;re enjoying the platform. If you have any feedback or questions, please let us know.</Text>

          <Text>
            Best regards,
            <br />
            The FundRoom Team
          </Text>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ThousandViewsCongratsEmail;
