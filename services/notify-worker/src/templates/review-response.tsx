import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { ReviewResponseProps as ReviewResponsePropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type ReviewResponseProps = ReviewResponsePropsBase;

export function ReviewResponse({
  appName,
  developerName,
  responseBody,
  reviewUrl,
}: ReviewResponseProps) {
  return (
    <Layout preview={`${developerName} replied to your review of ${appName}`}>
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        {developerName} replied to your review
      </Heading>
      <Text>
        The developer of <strong>{appName}</strong> responded to the review
        you left.
      </Text>
      <Text className="rounded-md bg-gray-50 p-3 text-[14px] italic text-gray-800">
        "{responseBody}"
      </Text>
      <Button
        href={reviewUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        View on OpenMarket
      </Button>
    </Layout>
  );
}

ReviewResponse.subject = (props: ReviewResponseProps) =>
  `${props.developerName} replied to your review of ${props.appName}`;
