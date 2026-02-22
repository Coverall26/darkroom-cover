import React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

import { Footer } from "./shared/footer";

const AdminLoginLinkEmail = ({
  url = "https://app.fundroom.ai",
}: {
  url: string;
}) => {
  return (
    <Html>
      <Head />
      <Preview>Admin login link for FundRoom</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[500px] rounded border border-solid border-gray-200 px-10 py-5">
            <Text className="mx-0 mb-8 mt-4 p-0 text-center text-2xl font-normal">
              <span className="font-bold tracking-tighter">FundRoom Admin Portal</span>
            </Text>
            <Text className="mx-0 my-7 p-0 text-center text-xl font-semibold text-black">
              Your Secure Admin Login Link
            </Text>

            <Text className="text-sm leading-6 text-black">
              Click the button below to sign in to the admin portal:
            </Text>
            <Section className="my-8 text-center">
              <Button
                className="rounded text-center text-xs font-semibold text-black no-underline"
                href={url}
                style={{ padding: "12px 20px", backgroundColor: "#f59e0b" }}
              >
                Log In to Admin Portal
              </Button>
            </Section>
            <Text className="text-sm leading-6 text-black">
              or copy and paste this URL into your browser:
            </Text>
            <Text className="text-sm">
              <Link 
                href={url} 
                className="text-purple-600"
                style={{ wordBreak: "break-all", overflowWrap: "break-word" }}
              >
                {url.replace(/^https?:\/\//, "")}
              </Link>
            </Text>
            <Text className="text-sm leading-6 text-gray-500 mt-6">
              This link expires in 1 hour.
            </Text>
            <Footer />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default AdminLoginLinkEmail;
