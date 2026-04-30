import type { Metadata } from "next";
import Link from "next/link";
import { DraftBanner, LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "DMCA Notice & Counter-Notice Procedure — OpenMarket",
  description:
    "How to file a DMCA copyright takedown notice with OpenMarket, and how to counter-notice if your content is removed.",
};

const TOC = [
  { id: "agent", label: "Designated Agent" },
  { id: "file-notice", label: "How to file a notice" },
  { id: "after-notice", label: "After we receive a notice" },
  { id: "counter-notice", label: "Counter-notice" },
  { id: "repeat-infringer", label: "Repeat-infringer policy" },
  { id: "trademark", label: "Trademark and other IP" },
  { id: "false-notices", label: "False notices" },
];

export default function DMCAPage() {
  return (
    <LegalLayout
      title="DMCA Notice & Counter-Notice Procedure"
      effectiveDate="2026-04-30"
      version="v2026.04.30"
      toc={TOC}
      banner={
        <DraftBanner note="OpenMarket cannot claim DMCA safe-harbor protection until we have registered a designated agent with the U.S. Copyright Office (per 17 U.S.C. § 512(c)(2)(A)). The Designated Agent contact below must be filled with a real person + address before going live." />
      }
    >
      <p className="lead">
        OpenMarket complies with the Digital Millennium Copyright Act ("DMCA").
        If you believe content on the Service infringes your copyright, you
        may file a notice with our Designated Agent.
      </p>

      <h2 id="agent">Designated Agent</h2>
      <ul>
        <li>
          <strong>Name:</strong> <em>pending publication</em>
        </li>
        <li>
          <strong>Email:</strong>{" "}
          <a href="mailto:dmca@openmarket.app">dmca@openmarket.app</a>
        </li>
        <li>
          <strong>Phone:</strong> <em>pending publication</em>
        </li>
        <li>
          <strong>Address:</strong> <em>pending publication</em>
        </li>
      </ul>
      <p>
        The Designated Agent registration is also filed with the U.S.
        Copyright Office at{" "}
        <a
          href="https://www.copyright.gov/dmca-directory/"
          target="_blank"
          rel="noreferrer"
        >
          copyright.gov/dmca-directory
        </a>
        .
      </p>

      <h2 id="file-notice">How to file a notice</h2>
      <p>
        To be effective under 17 U.S.C. § 512(c)(3), your notice must include
        all of the following:
      </p>
      <ol>
        <li>
          <strong>Identification</strong> of the copyrighted work claimed to
          have been infringed.
        </li>
        <li>
          <strong>Identification</strong> of the allegedly infringing material
          with sufficient detail to permit us to locate it (a URL on
          openmarket.app is best).
        </li>
        <li>
          <strong>Your contact information</strong> — name, address,
          telephone, and email.
        </li>
        <li>
          <strong>A statement</strong> that you have a good-faith belief that
          the use is not authorized by the copyright owner, its agent, or the
          law.
        </li>
        <li>
          <strong>A statement, under penalty of perjury,</strong> that the
          information in the notice is accurate and that you are the owner of
          the right or authorized to act on the owner's behalf.
        </li>
        <li>
          <strong>Your physical or electronic signature.</strong>
        </li>
      </ol>
      <p>You can submit notices via:</p>
      <ul>
        <li>
          Email to{" "}
          <a href="mailto:dmca@openmarket.app">dmca@openmarket.app</a>, or
        </li>
        <li>
          The web form at{" "}
          <Link href="/dmca/submit">/dmca/submit</Link> — coming soon — captures
          every required field.
        </li>
      </ul>
      <p>
        <strong>
          Knowingly false notices are punishable under 17 U.S.C. § 512(f).
        </strong>{" "}
        Fraudulent or malicious notices will be rejected, and we may pursue
        costs and damages.
      </p>

      <h2 id="after-notice">What happens after we receive a notice</h2>
      <ol>
        <li>
          <strong>Within 24 hours of receipt</strong> of a facially-valid
          notice, we will:
          <ul>
            <li>Remove or disable access to the identified material.</li>
            <li>
              Notify the developer of the affected app with a copy of the
              notice.
            </li>
            <li>
              Log the action in our public{" "}
              <Link href="/transparency-report">transparency report</Link>.
            </li>
          </ul>
        </li>
        <li>The developer may submit a counter-notice (see below).</li>
        <li>
          If a counter-notice is received, we will forward it to you and,
          after <strong>10–14 business days</strong>, restore the content
          unless you have filed a court action against the developer for
          infringement.
        </li>
      </ol>

      <h2 id="counter-notice">Counter-notice (developer side)</h2>
      <p>
        If you are a developer whose content has been removed, and you believe
        the removal is mistaken or that you have authorization, you may submit
        a counter-notice. To be effective under 17 U.S.C. § 512(g)(3), it must
        include:
      </p>
      <ol>
        <li>
          <strong>Your contact information</strong> — name, address, phone,
          email.
        </li>
        <li>
          <strong>Identification</strong> of the material that was removed and
          where it appeared before removal.
        </li>
        <li>
          <strong>A statement, under penalty of perjury,</strong> that you
          have a good-faith belief that the material was removed by mistake or
          misidentification.
        </li>
        <li>
          <strong>A statement</strong> that you consent to the jurisdiction of
          the federal court for the district in which your address is located
          (or, if outside the U.S., the Northern District of California), and
          that you accept service of process from the original notifier.
        </li>
        <li>
          <strong>Your physical or electronic signature.</strong>
        </li>
      </ol>

      <h2 id="repeat-infringer">Repeat-infringer policy</h2>
      <p>
        We will, in appropriate circumstances, terminate the accounts of users
        and developers who are repeat infringers. We define "repeat infringer"
        as <strong>3 or more separate, valid DMCA notices in a 12-month
        period</strong> that are not successfully counter-noticed. Termination
        is logged in the public transparency report.
      </p>

      <h2 id="trademark">Trademark and other IP claims</h2>
      <p>
        This procedure is for copyright. For trademark or other intellectual
        property claims, contact{" "}
        <a href="mailto:legal@openmarket.app">legal@openmarket.app</a> with
        the substance of your claim. We will respond within 5 business days.
      </p>

      <h2 id="false-notices">Knowingly false notices</h2>
      <p>We take false notices seriously. If you submit a knowingly false DMCA notice we may:</p>
      <ul>
        <li>Reject it.</li>
        <li>Restore the content immediately.</li>
        <li>Note the false notice in the public transparency report.</li>
        <li>Pursue costs and damages under 17 U.S.C. § 512(f).</li>
      </ul>
      <p>The same applies to false counter-notices.</p>

      <h2>Changelog</h2>
      <ul>
        <li>
          <strong>v2026.04.30</strong> — Initial draft. Designated Agent
          registration pending.
        </li>
      </ul>
    </LegalLayout>
  );
}
