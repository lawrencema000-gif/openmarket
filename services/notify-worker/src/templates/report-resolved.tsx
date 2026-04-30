import { Heading, Text } from "@react-email/components";
import * as React from "react";
import type { ReportResolvedProps as ReportResolvedPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type ReportResolvedProps = ReportResolvedPropsBase;

const RESOLUTION_TEXT: Record<ReportResolvedProps["resolution"], string> = {
  delisted: "We delisted the reported content.",
  warned: "We issued a warning to the responsible developer.",
  dismissed: "We reviewed the report and decided not to take action.",
};

export function ReportResolved({
  reportId,
  targetType,
  resolution,
  notes,
  transparencyUrl,
}: ReportResolvedProps) {
  return (
    <Layout preview="Your OpenMarket report has been reviewed">
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Report #{reportId.slice(0, 8)} resolved
      </Heading>
      <Text>
        Thank you for reporting. {RESOLUTION_TEXT[resolution]}
      </Text>
      {notes ? (
        <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
          {notes}
        </Text>
      ) : null}
      <Text className="text-sm text-gray-700">
        Every moderation decision goes into our public transparency log so the
        community can audit our work.{" "}
        <a href={transparencyUrl} className="underline">
          Read the transparency report
        </a>
        .
      </Text>
      <Text className="text-xs text-gray-500">
        Reference: {targetType} report #{reportId.slice(0, 8)}.
      </Text>
    </Layout>
  );
}

ReportResolved.subject = (_props: ReportResolvedProps) =>
  "Your OpenMarket report has been reviewed";
