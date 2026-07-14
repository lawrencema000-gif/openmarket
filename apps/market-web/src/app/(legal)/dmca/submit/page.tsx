import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";
import { DmcaForm } from "./DmcaForm";

export const metadata: Metadata = {
  title: "Submit a DMCA notice",
  description:
    "File a copyright takedown notice under 17 USC 512(c). Every notice is logged in the public transparency report.",
};

export default function DmcaSubmitPage() {
  return (
    <LegalLayout
      title="Submit a DMCA notice"
      effectiveDate="2026-05-12"
      version="v2026.05.12"
    >
      <p className="lead">
        File a copyright takedown notice under 17 USC 512(c). Please read
        the full <Link href="/dmca">DMCA policy</Link> first — it explains
        what we need, what happens after you submit, and what the alleged
        infringer's rights are.
      </p>

      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 not-prose">
        <strong>Knowingly false notices are illegal.</strong> Under 17 USC
        512(f) a person who knowingly materially misrepresents that material
        is infringing is liable for damages, including costs and attorney
        fees, incurred by the alleged infringer.
      </p>

      <p>
        Every notice is logged in our{" "}
        <Link href="/transparency-report">public transparency report</Link>{" "}
        with the cited copyrighted work, the legal basis (17 USC 512(c)),
        and the time-to-action.
      </p>

      <h2>The notice</h2>
      <DmcaForm />

      <h2>What happens next</h2>
      <ol>
        <li>
          We acknowledge receipt by email within minutes (check your spam
          folder if you don't see it).
        </li>
        <li>
          A trust-and-safety reviewer maps your notice to a specific app on
          OpenMarket. If we can't identify the targeted app, we'll email you
          back asking for clarification.
        </li>
        <li>
          On a valid notice, the app is delisted within 24 hours of our
          validation. The transparency log records the takedown.
        </li>
        <li>
          We notify the alleged infringer (the app's developer) of the
          takedown and their right to file a counter-notice under 17 USC
          512(g).
        </li>
        <li>
          If a counter-notice is filed, you have 10 calendar days to file
          an action seeking a court order against the alleged infringer.
          If you do not, we restore the app.
        </li>
      </ol>
    </LegalLayout>
  );
}
