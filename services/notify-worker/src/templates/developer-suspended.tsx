import { Heading, Text } from "@react-email/components";
import * as React from "react";
import type { DeveloperSuspendedProps as DeveloperSuspendedPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type DeveloperSuspendedProps = DeveloperSuspendedPropsBase;

export function DeveloperSuspended({
  developerName,
  reason,
  rulesUrl,
  appealUrl,
  effectiveAt,
}: DeveloperSuspendedProps) {
  return (
    <Layout preview="Your developer account has been suspended">
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Your developer account has been suspended
      </Heading>
      <Text>
        Hi {developerName}, your OpenMarket developer account was suspended on{" "}
        {effectiveAt}. While suspended, your apps are not distributed and you
        cannot publish new releases.
      </Text>
      <Text className="font-medium">Reason given:</Text>
      <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
        {reason}
      </Text>
      <Text className="mt-4 text-[14px] text-gray-700">
        Review our{" "}
        <a href={rulesUrl} className="underline">
          content policy
        </a>{" "}
        to understand what led to this.
      </Text>
      <Text className="mt-6 text-xs text-gray-500">
        Believe this was a mistake?{" "}
        <a href={appealUrl} className="underline">
          File an appeal
        </a>
        . Appeals get a written response within 5 business days.
      </Text>
    </Layout>
  );
}

DeveloperSuspended.subject = (_props: DeveloperSuspendedProps) =>
  "Your OpenMarket developer account has been suspended";
