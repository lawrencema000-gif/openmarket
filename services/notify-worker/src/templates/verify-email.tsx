import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { VerifyEmailProps as VerifyEmailPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type VerifyEmailProps = VerifyEmailPropsBase;

export function VerifyEmail({ verifyUrl, expiryMinutes = 60 }: VerifyEmailProps) {
  return (
    <Layout
      preview="Confirm your email to finish setting up your OpenMarket account"
      showUnsubscribe={false}
    >
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Confirm your email
      </Heading>
      <Text>
        Tap the button below to confirm this is your email address. The link
        expires in {expiryMinutes} minutes.
      </Text>
      <Button
        href={verifyUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Confirm email
      </Button>
      <Text className="mt-6 text-xs text-gray-500">
        If you didn't create an OpenMarket account, you can ignore this email
        and the address won't be added.
      </Text>
    </Layout>
  );
}

VerifyEmail.subject = (_props: VerifyEmailProps) => "Confirm your OpenMarket email";
