import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { DeveloperTakedownProps as DeveloperTakedownPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

/**
 * Sent to a developer when their app is delisted.
 *
 * Per §2 principle 3 (developer due process): every delisting must be
 * appealable with a written response within a published SLA. This email
 * is that notice.
 */
export type DeveloperTakedownProps = DeveloperTakedownPropsBase;

export function DeveloperTakedown({
  appName,
  reason,
  ruleVersion,
  rulesUrl,
  appealUrl,
  effectiveAt,
}: DeveloperTakedownProps) {
  return (
    <Layout preview={`${appName} has been delisted from OpenMarket`} showUnsubscribe={false}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        {appName} has been delisted
      </Heading>
      <Text>
        Effective {effectiveAt}, <strong>{appName}</strong> has been delisted
        from OpenMarket. Existing installs continue to work; the app is no
        longer discoverable in search and cannot receive updates.
      </Text>
      <Text className="font-medium">Reason cited</Text>
      <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
        {reason}
      </Text>
      <Text className="text-sm">
        This decision was made under{" "}
        <a href={rulesUrl} className="underline">
          content policy {ruleVersion}
        </a>
        . You can read the full rule and what it covers.
      </Text>
      <Button
        href={appealUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        File an appeal
      </Button>
      <Text className="mt-6 text-xs text-gray-500">
        Appeals receive a written response within 5 business days. If we
        cannot resolve your appeal you'll receive a final written explanation
        and a published transparency-log entry. We don't remove apps quietly.
      </Text>
    </Layout>
  );
}

DeveloperTakedown.subject = (props: DeveloperTakedownProps) =>
  `${props.appName} has been delisted — appeal available`;
