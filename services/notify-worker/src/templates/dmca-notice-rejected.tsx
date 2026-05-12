import { Heading, Text } from "@react-email/components";
import * as React from "react";
import type { DmcaNoticeRejectedProps as Base } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type DmcaNoticeRejectedProps = Base;

export function DmcaNoticeRejected({
  noticeNumber,
  reason,
}: DmcaNoticeRejectedProps) {
  return (
    <Layout preview={`DMCA notice ${noticeNumber} was not actioned`} showUnsubscribe={false}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        We could not action your DMCA notice
      </Heading>
      <Text>
        Your DMCA notice{" "}
        <strong className="font-mono">{noticeNumber}</strong> did not satisfy
        the requirements of 17 USC 512(c)(3) and we could not action it.
      </Text>
      <Text className="font-medium">Reason</Text>
      <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
        {reason}
      </Text>
      <Text className="text-sm">
        You're welcome to resubmit a corrected notice. If you believe this
        rejection is in error, reply to this email referencing the notice
        number above.
      </Text>
    </Layout>
  );
}

DmcaNoticeRejected.subject = (props: DmcaNoticeRejectedProps) =>
  `DMCA notice ${props.noticeNumber} not actioned`;
