import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { DeveloperReinstatedProps as DeveloperReinstatedPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type DeveloperReinstatedProps = DeveloperReinstatedPropsBase;

export function DeveloperReinstated({
  developerName,
  note,
  dashboardUrl,
  effectiveAt,
}: DeveloperReinstatedProps) {
  return (
    <Layout preview="Your developer account has been reinstated">
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Your developer account has been reinstated
      </Heading>
      <Text>
        Good news, {developerName} — your OpenMarket developer account was
        reinstated on {effectiveAt}. You can publish releases and your apps are
        distributed again.
      </Text>
      {note ? (
        <>
          <Text className="font-medium">Note from the review team:</Text>
          <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
            {note}
          </Text>
        </>
      ) : null}
      <Button
        href={dashboardUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Open your dashboard
      </Button>
    </Layout>
  );
}

DeveloperReinstated.subject = (_props: DeveloperReinstatedProps) =>
  "Your OpenMarket developer account has been reinstated";
