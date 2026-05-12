import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { DmcaTakedownNoticeProps as Base } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type DmcaTakedownNoticeProps = Base;

/**
 * Sent to the developer of an app delisted under DMCA. Spells out
 * their right to file a counter-notice under 17 USC 512(g).
 */
export function DmcaTakedownNotice({
  noticeNumber,
  appName,
  copyrightedWork,
  counterNoticeUrl,
}: DmcaTakedownNoticeProps) {
  return (
    <Layout preview={`${appName} delisted — DMCA notice ${noticeNumber}`} showUnsubscribe={false}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        {appName} has been delisted under DMCA
      </Heading>
      <Text>
        We received a DMCA takedown notice (reference{" "}
        <strong className="font-mono">{noticeNumber}</strong>) identifying
        material in your app as infringing the following copyrighted work:
      </Text>
      <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
        {copyrightedWork}
      </Text>
      <Text>
        We have delisted <strong>{appName}</strong> from the storefront under
        17 USC 512(c) safe-harbor procedures. Existing installs continue to
        work; new installs and updates are blocked.
      </Text>
      <Heading as="h2" className="text-base font-semibold text-gray-900 mt-6 mb-2">
        Your right to counter-notice
      </Heading>
      <Text>
        Under 17 USC 512(g) you may file a counter-notice if you believe the
        material was removed by mistake or misidentification. To do so you
        must:
      </Text>
      <Text className="m-0 ml-3 text-sm">• identify the removed material and its location</Text>
      <Text className="m-0 ml-3 text-sm">
        • state under penalty of perjury that the removal was a mistake or
        misidentification
      </Text>
      <Text className="m-0 ml-3 text-sm">
        • consent to the jurisdiction of the federal district court for the
        district in which the original claimant's address is located
      </Text>
      <Text className="m-0 ml-3 text-sm">• sign electronically</Text>
      <Button
        href={counterNoticeUrl}
        className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        File a counter-notice
      </Button>
      <Text className="mt-6 text-xs text-gray-500">
        If you file a valid counter-notice, we will forward it to the original
        claimant. If they do not file a court action within 10 business days,
        we will restore the app. The takedown — and any restoration — appears
        in our public transparency report.
      </Text>
    </Layout>
  );
}

DmcaTakedownNotice.subject = (props: DmcaTakedownNoticeProps) =>
  `${props.appName} delisted under DMCA (${props.noticeNumber})`;
