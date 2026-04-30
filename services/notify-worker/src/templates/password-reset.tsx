import { Button, Heading, Text } from "@react-email/components";
import * as React from "react";
import type { PasswordResetProps as PasswordResetPropsBase } from "@openmarket/contracts";
import { Layout } from "./_layout.js";

export type PasswordResetProps = PasswordResetPropsBase;

export function PasswordReset({
  resetUrl,
  expiryMinutes = 30,
  ipAddress,
}: PasswordResetProps) {
  return (
    <Layout
      preview="Reset your OpenMarket password"
      showUnsubscribe={false}
    >
      <Heading className="m-0 text-xl font-semibold text-gray-900">
        Reset your password
      </Heading>
      <Text>
        Someone requested a password reset for this address. If that was you,
        tap below — the link expires in {expiryMinutes} minutes.
      </Text>
      <Button
        href={resetUrl}
        className="mt-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Reset password
      </Button>
      <Text className="mt-6 text-xs text-gray-500">
        {ipAddress ? `Request came from ${ipAddress}. ` : null}
        If this wasn't you, ignore this email — your password is unchanged.
        If you see repeated reset attempts, contact security@openmarket.app.
      </Text>
    </Layout>
  );
}

PasswordReset.subject = (_props: PasswordResetProps) => "Reset your OpenMarket password";
