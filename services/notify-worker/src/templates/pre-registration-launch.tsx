import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { PreRegistrationLaunchProps as Base } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type PreRegistrationLaunchProps = Base;

export function PreRegistrationLaunch({
  appTitle,
  appId,
  versionName,
}: PreRegistrationLaunchProps) {
  const installUrl = `${process.env.STOREFRONT_URL ?? "https://openmarket.app"}/apps/${appId}`;
  return (
    <Layout
      preview={`${appTitle} just launched — install now`}
      showUnsubscribe={true}
    >
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        {appTitle} is here!
      </Heading>
      <Text>
        The app you pre-registered for just launched on OpenMarket
        (v{versionName}). You're on the launch list — open the store to
        install it now.
      </Text>
      <Button
        href={installUrl}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Install {appTitle}
      </Button>
      <Text className="mt-6 text-xs text-gray-500">
        You're receiving this because you pre-registered for {appTitle}. You
        can manage notification preferences from your OpenMarket account.
      </Text>
    </Layout>
  );
}

PreRegistrationLaunch.subject = (props: PreRegistrationLaunchProps) =>
  `${props.appTitle} just launched on OpenMarket`;
