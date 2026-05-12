import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { TeamInviteProps as Base } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type TeamInviteProps = Base;

export function TeamInvite({
  inviterName,
  developerName,
  role,
  acceptUrl,
  expiresIn,
}: TeamInviteProps) {
  return (
    <Layout preview={`Join ${developerName} on OpenMarket`} showUnsubscribe={false}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        You're invited to join {developerName}
      </Heading>
      <Text>
        {inviterName} invited you to join the <strong>{developerName}</strong>{" "}
        publisher account on OpenMarket as a <strong>{role}</strong>.
      </Text>
      <Text className="text-sm text-gray-600">
        Roles control what you can do inside the publisher account:
      </Text>
      <Text className="m-0 text-sm">
        • <strong>owner</strong> — full control, including billing and team
      </Text>
      <Text className="m-0 text-sm">
        • <strong>admin</strong> — manage team, API tokens, publish releases
      </Text>
      <Text className="m-0 text-sm">
        • <strong>developer</strong> — publish releases, edit listings, view
        stats
      </Text>
      <Text className="m-0 text-sm">
        • <strong>viewer</strong> — read-only across the dashboard
      </Text>
      <Button
        href={acceptUrl}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Accept invite
      </Button>
      <Text className="mt-6 text-xs text-gray-500">
        This invite expires {expiresIn}. If you didn't expect this email,
        you can safely ignore it.
      </Text>
    </Layout>
  );
}

TeamInvite.subject = (props: TeamInviteProps) =>
  `${props.inviterName} invited you to ${props.developerName} on OpenMarket`;
