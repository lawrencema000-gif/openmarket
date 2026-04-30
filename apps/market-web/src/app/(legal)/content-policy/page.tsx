import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Content Policy — OpenMarket",
  description:
    "What apps we will and won't host on OpenMarket, and how we make those decisions.",
};

const TOC = [
  { id: "principles", label: "Principles" },
  { id: "not-allowed", label: "What we don't allow" },
  { id: "do-allow", label: "What we DO allow" },
  { id: "trust-signals", label: "Trust signals" },
  { id: "process", label: "Process" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function ContentPolicyPage() {
  return (
    <LegalLayout
      title="Content Policy"
      effectiveDate="2026-04-30"
      version="v2026.04.30"
      toc={TOC}
    >
      <p className="lead">
        This is what we will and won't host on OpenMarket, and how we make those
        decisions.
      </p>

      <h2 id="principles">Principles</h2>
      <p>We hold ourselves to two non-negotiable principles:</p>
      <ol>
        <li>
          <strong>Viewpoint-neutrality.</strong> We don't remove apps for being
          unpopular, controversial, or politically inconvenient. We remove for
          the categorical reasons listed below — nothing else.
        </li>
        <li>
          <strong>Transparency.</strong> Every removal goes into a{" "}
          <Link href="/transparency-report">public log</Link> with the reason
          cited and the version of this policy that was applied. Every removal
          is appealable.
        </li>
      </ol>
      <p>
        If you think we've crossed either line,{" "}
        <strong>tell us</strong> — and the public — using the appeal process at
        the end of this document.
      </p>

      <h2 id="not-allowed">What we don't allow</h2>
      <p>
        These categories will get an app removed. Each has narrow, written
        criteria. We will cite a specific subsection when removing.
      </p>

      <h3>1. Malware and active harm to users</h3>
      <ul>
        <li>Code that exfiltrates user data without consent.</li>
        <li>
          Code that attacks other systems (botnets, DDoS, RATs that aren't
          clearly labeled and consented).
        </li>
        <li>Cryptominers running without disclosure and consent.</li>
        <li>
          Persistent ads that can't be dismissed, or that masquerade as system
          UI.
        </li>
      </ul>
      <p>
        How we determine: automated scans (permission analysis, signing-key
        checks, repackaging detection, native-lib reputation) plus manual
        review on any flag. False positives are appealable; we will reverse with
        public note in the transparency log when we get it wrong.
      </p>

      <h3>2. Illegal content</h3>
      <ul>
        <li>
          Child sexual abuse material — reported to NCMEC, account permanently
          banned, no appeal.
        </li>
        <li>
          Material that is illegal in the developer's stated jurisdiction or
          the user's jurisdiction (we will geo-block where possible rather than
          remove globally).
        </li>
        <li>
          Apps directly facilitating crimes against persons (stalkerware,
          doxxing-as-a-service, swatting tools).
        </li>
      </ul>

      <h3>3. Sexual content involving minors or non-consent</h3>
      <p>
        Beyond the legal floor in §2: any sexual or sexualized depiction of a
        minor, regardless of medium (drawn, AI-generated, etc.). Non-consensual
        intimate imagery (NCII / "revenge porn") at the request of the depicted
        party.
      </p>

      <h3>4. Imminent, real-world harm to identifiable people</h3>
      <ul>
        <li>Direct threats of violence with a credible target.</li>
        <li>
          Doxxing — publication of private personal information about an
          identifiable individual without consent.
        </li>
        <li>
          Coordinated harassment campaigns that use the platform as
          infrastructure.
        </li>
      </ul>
      <p>
        This is a high bar on purpose. Generic political insults, criticism of
        public figures, satire, and parody are not in scope.
      </p>

      <h3>5. Deception that targets the user</h3>
      <ul>
        <li>
          Apps that misrepresent what they are (e.g., "calculator" that's
          actually a stalkerware tool).
        </li>
        <li>
          Phishing apps that imitate banks, governments, or recognizable brands
          without authorization.
        </li>
        <li>
          Repackaged copies of other apps with malicious modifications.
        </li>
        <li>Fake reviews / reviews-for-pay rings.</li>
      </ul>

      <h3>6. Adult content not labeled as such</h3>
      <p>
        We host adult apps. We require they be labeled with the{" "}
        <code>mature</code> content rating and gated behind an age confirmation.
        Failure to label is the violation, not the content.
      </p>

      <h3>7. Spam</h3>
      <p>
        Mass-produced low-quality apps designed to game discovery (translation:
        thousands of identical "wallpaper" apps spammed by one developer to
        capture search terms).
      </p>

      <h2 id="do-allow">What we DO allow that some other stores don't</h2>
      <p>
        We're explicit about this because being unclear here is how
        viewpoint-discrimination starts.
      </p>
      <ul>
        <li>
          <strong>Religious and political speech</strong>, including
          controversial speech, edgy speech, satire, and speech that makes us
          personally uncomfortable.
        </li>
        <li>
          <strong>Off-platform speech.</strong> What you say outside OpenMarket
          is not our business unless it crosses into §1.4 (imminent harm) and
          the platform is being used as infrastructure for it.
        </li>
        <li>
          <strong>Adult content</strong>, properly labeled and rated.
        </li>
        <li>
          <strong>Apps that compete with us, with Google, or with established
          players.</strong>{" "}
          We will never remove an app for "competitive" reasons.
        </li>
        <li>
          <strong>
            Federation, sideloading, alternative stores, decentralized apps,
            cryptocurrency apps
          </strong>{" "}
          — full stop. These are software categories, not violations.
        </li>
        <li>
          <strong>
            Modding tools, emulators, content-blockers, ad-blockers, privacy
            tools, root-related apps
          </strong>{" "}
          — we host them with appropriate labeling.
        </li>
        <li>
          <strong>Apps that some governments dislike.</strong> Where a
          government order is involved we will geo-block in that jurisdiction
          rather than remove globally, and we will note it in the transparency
          log.
        </li>
      </ul>
      <p>
        If your app would be removed from another store on these grounds, that
        is not by itself a reason we will remove it.
      </p>

      <h2 id="trust-signals">Trust signals (not gates)</h2>
      <p>
        We don't gate publication on editorial approval. Instead, we surface
        objective signals on every listing so users can make informed choices:
      </p>
      <ul>
        <li>Verified developer identity.</li>
        <li>
          Whether the app's signing key matches the developer's registered key.
        </li>
        <li>Permissions requested and what they imply.</li>
        <li>Whether source code is public.</li>
        <li>Risk score from automated scans, with the underlying findings linked.</li>
        <li>Reviews and install volume.</li>
      </ul>
      <p>
        Trust tiers (<code>standard</code>, <code>enhanced</code>,{" "}
        <code>experimental</code>) appear next to each app. They affect ranking,
        not eligibility.
      </p>

      <h2 id="process">Process</h2>

      <h3>Reporting an app</h3>
      <p>
        Anyone can file a report from the app detail page or via{" "}
        <a href="mailto:trust@openmarket.app">trust@openmarket.app</a>. We
        respond to every report. Categorically out-of-scope reports get a
        polite no with a citation to this policy.
      </p>

      <h3>Investigation</h3>
      <p>
        For Tier 1 violations (malware, illegal, CSAM, imminent harm) we act
        fast and explain after.
      </p>
      <p>For everything else we act slow and explain first:</p>
      <ul>
        <li>
          Notice to the developer with a copy of the report and the rule we
          think applies.
        </li>
        <li>7 days for response (3 days for time-sensitive matters).</li>
        <li>
          Decision with a written reason citing this policy + the rule version.
        </li>
      </ul>

      <h3>Appeals</h3>
      <p>
        Every action is appealable. Appeals get a written response within 5
        business days. If we cannot resolve your appeal, the final outcome and
        a written explanation go into the public transparency log so the
        community can audit our work.
      </p>
      <p>
        Appeal at: dev portal → app → "File an appeal" (or{" "}
        <a href="mailto:appeals@openmarket.app">appeals@openmarket.app</a> if
        your account is suspended).
      </p>

      <h3>Government / legal requests</h3>
      <p>
        We comply with valid legal process and we publish counts in the{" "}
        <Link href="/transparency-report">transparency report</Link>. We will
        not honor informal "requests" to remove content without a court order
        or DMCA-equivalent process. We will, where legal, notify the affected
        developer before complying.
      </p>

      <h2 id="changes">Changes to this policy</h2>
      <ul>
        <li>
          Substantive changes get a 30-day notice period before they take
          effect, posted on this page and on the transparency report.
        </li>
        <li>
          Editorial / clarifying changes go in immediately and are noted in
          the changelog at the bottom of this page.
        </li>
        <li>
          Old versions are kept in git so the version cited in any
          transparency-log entry can be looked up.
        </li>
      </ul>

      <h2 id="contact">Contact</h2>
      <ul>
        <li>
          General trust & safety:{" "}
          <a href="mailto:trust@openmarket.app">trust@openmarket.app</a>
        </li>
        <li>
          Appeals:{" "}
          <a href="mailto:appeals@openmarket.app">appeals@openmarket.app</a>
        </li>
        <li>
          Legal / DMCA:{" "}
          <a href="mailto:legal@openmarket.app">legal@openmarket.app</a> (see
          also our <Link href="/dmca">DMCA policy</Link>)
        </li>
        <li>
          Security disclosures:{" "}
          <a href="mailto:security@openmarket.app">security@openmarket.app</a>{" "}
          (see <Link href="/security">Security</Link>)
        </li>
      </ul>

      <h2>Changelog</h2>
      <ul>
        <li>
          <strong>v2026.04.30</strong> — Initial publication. Pending lawyer
          review of §1.2 (illegal content) and §3 (process).
        </li>
      </ul>
    </LegalLayout>
  );
}
