import { Heading, Text } from "@react-email/components";
import * as React from "react";
import type { DmcaCounterNoticeRejectedProps as Base } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type DmcaCounterNoticeRejectedProps = Base;

export function DmcaCounterNoticeRejected({
  counterPartyName,
  reason,
}: DmcaCounterNoticeRejectedProps) {
  return (
    <Layout
      preview="Your DMCA counter-notice was not accepted"
      showUnsubscribe={false}
    >
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Your DMCA counter-notice was not accepted
      </Heading>
      <Text>Hi {counterPartyName},</Text>
      <Text>
        After review, your §512(g) counter-notice did not meet the
        requirements we need to restore the affected app, so it was not
        accepted. The app remains delisted.
      </Text>
      <Text className="font-medium">Reason</Text>
      <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
        {reason}
      </Text>
      <Text className="text-sm">
        You may file a corrected counter-notice that addresses the issue
        above, or pursue other legal remedies. If you believe this decision
        is in error, reply to this email and reference your app.
      </Text>
    </Layout>
  );
}

DmcaCounterNoticeRejected.subject = () =>
  "Your DMCA counter-notice was not accepted";
