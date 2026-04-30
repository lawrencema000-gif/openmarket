import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { ReleaseRejectedProps as ReleaseRejectedPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type ReleaseRejectedProps = ReleaseRejectedPropsBase;

export function ReleaseRejected({
  appName,
  versionName,
  versionCode,
  reason,
  findings,
  fixUrl,
  appealUrl,
}: ReleaseRejectedProps) {
  return (
    <Layout preview={`${appName} v${versionName} could not be published`}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Release not published
      </Heading>
      <Text>
        We couldn't publish <strong>{appName}</strong> v{versionName} (build{" "}
        {versionCode}). Reason given:
      </Text>
      <Text className="rounded-md bg-gray-50 p-3 text-[14px] text-gray-800">
        {reason}
      </Text>
      {findings && findings.length > 0 ? (
        <>
          <Text className="font-medium">Specific findings:</Text>
          <ul className="my-2 list-disc pl-5 text-[14px] text-gray-700">
            {findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </>
      ) : null}
      <Button
        href={fixUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Fix and re-upload
      </Button>
      <Text className="mt-6 text-xs text-gray-500">
        Believe this was wrong?{" "}
        <a href={appealUrl} className="underline">
          File an appeal
        </a>
        . Appeals get a written response within 5 business days.
      </Text>
    </Layout>
  );
}

ReleaseRejected.subject = (props: ReleaseRejectedProps) =>
  `${props.appName} v${props.versionName} not published — action needed`;
