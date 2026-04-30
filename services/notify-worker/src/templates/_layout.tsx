import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import * as React from "react";

/**
 * Shared layout for every transactional email.
 *
 * Design rules (from §2 of IMPLEMENTATION-PLAN.md):
 * - No tracking pixels.
 * - No third-party fonts (Apple/Outlook strip them anyway).
 * - Plain unsubscribe in the footer for non-critical emails.
 * - Footer always cites privacy policy + terms.
 */
export interface LayoutProps {
  preview: string;
  children: React.ReactNode;
  /** Brand mark text. Defaults to "OpenMarket". */
  brand?: string;
  /** Show "manage notifications" link in footer. Default true. */
  showUnsubscribe?: boolean;
  /** Public web URL — defaults to env-driven config. */
  webBaseUrl?: string;
}

export function Layout({
  preview,
  children,
  brand = "OpenMarket",
  showUnsubscribe = true,
  webBaseUrl,
}: LayoutProps) {
  const base =
    webBaseUrl ??
    process.env.WEB_BASE_URL ??
    "https://openmarket.app";

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="mx-auto my-10 max-w-[560px] rounded-lg bg-white p-8 shadow-sm">
            <Section className="border-b border-gray-200 pb-4">
              <Text className="m-0 text-lg font-semibold tracking-tight text-gray-900">
                {brand}
              </Text>
            </Section>
            <Section className="py-6 text-[15px] leading-6 text-gray-800">
              {children}
            </Section>
            <Hr className="my-6 border-gray-200" />
            <Section className="text-xs text-gray-500">
              <Text className="m-0">
                Sent by {brand}. We never sell your data.
              </Text>
              <Text className="m-0 mt-2">
                <Link href={`${base}/privacy`} className="text-gray-600 underline">
                  Privacy
                </Link>{" "}
                ·{" "}
                <Link href={`${base}/terms`} className="text-gray-600 underline">
                  Terms
                </Link>
                {showUnsubscribe ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      href={`${base}/account/notifications`}
                      className="text-gray-600 underline"
                    >
                      Manage notifications
                    </Link>
                  </>
                ) : null}
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
