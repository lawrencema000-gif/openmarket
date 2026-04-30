import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { WelcomeEmailProps } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type WelcomeProps = WelcomeEmailProps;

export function Welcome({ recipientName, ctaUrl }: WelcomeProps) {
  const greeting = recipientName ? `Welcome, ${recipientName}.` : "Welcome to OpenMarket.";
  return (
    <Layout
      preview="Welcome to OpenMarket — viewpoint-neutral Android apps"
      showUnsubscribe={false}
    >
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        {greeting}
      </Heading>
      <Text>
        OpenMarket is a viewpoint-neutral Android app marketplace. We host
        what's legal, transparent, and signed — and we tell you exactly why
        anything is removed.
      </Text>
      <Text>
        You're in. Browse the catalog, install your first app, and join the
        review conversation.
      </Text>
      <Button
        href={ctaUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Open the marketplace
      </Button>
    </Layout>
  );
}

Welcome.subject = (props: WelcomeProps) =>
  props.recipientName
    ? `Welcome to OpenMarket, ${props.recipientName}`
    : "Welcome to OpenMarket";
