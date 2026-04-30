import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { ReleasePublishedProps as ReleasePublishedPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type ReleasePublishedProps = ReleasePublishedPropsBase;

export function ReleasePublished({
  appName,
  versionName,
  versionCode,
  releaseUrl,
  reviewUrl,
  riskScore,
}: ReleasePublishedProps) {
  return (
    <Layout preview={`${appName} v${versionName} is now live on OpenMarket`}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Your release is live
      </Heading>
      <Text>
        <strong>{appName}</strong> v{versionName} (build {versionCode}) is
        published and discoverable on OpenMarket.
      </Text>
      {typeof riskScore === "number" ? (
        <Text className="text-sm text-gray-700">
          Security scan complete. Risk score: <strong>{riskScore}/100</strong>.
          {reviewUrl ? (
            <>
              {" "}
              <a href={reviewUrl} className="underline">
                Review the full report
              </a>
              .
            </>
          ) : null}
        </Text>
      ) : null}
      <Button
        href={releaseUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        View on the marketplace
      </Button>
    </Layout>
  );
}

ReleasePublished.subject = (props: ReleasePublishedProps) =>
  `${props.appName} v${props.versionName} is live`;
