import { Heading, Text } from "@react-email/components";
import * as React from "react";
import type { DmcaNoticeReceivedProps as Base } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type DmcaNoticeReceivedProps = Base;

export function DmcaNoticeReceived({
  noticeNumber,
  claimantName,
}: DmcaNoticeReceivedProps) {
  return (
    <Layout preview={`We received your DMCA notice (${noticeNumber})`} showUnsubscribe={false}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        DMCA notice received
      </Heading>
      <Text>
        Hi {claimantName}, we received your DMCA takedown notice and assigned
        it the reference number{" "}
        <strong className="font-mono">{noticeNumber}</strong>.
      </Text>
      <Text>
        A trust-and-safety reviewer will assess the notice and respond within
        24 hours. If the notice satisfies 17 USC 512(c)(3), we will delist the
        targeted material and notify the alleged infringer of their right to
        file a counter-notice.
      </Text>
      <Text className="text-sm text-gray-600">
        If you don't see an update from us in 24 hours, reply to this email
        with the reference number.
      </Text>
    </Layout>
  );
}

DmcaNoticeReceived.subject = (props: DmcaNoticeReceivedProps) =>
  `DMCA notice received (${props.noticeNumber})`;
