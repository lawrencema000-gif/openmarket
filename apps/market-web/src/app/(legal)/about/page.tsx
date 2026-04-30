import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "About — OpenMarket",
  description:
    "OpenMarket is a viewpoint-neutral Android app marketplace. Our mission, principles, and contact information.",
};

const TOC = [
  { id: "mission", label: "Mission" },
  { id: "principles", label: "Principles" },
  { id: "open-source", label: "Open source" },
  { id: "team", label: "Team" },
  { id: "contact", label: "Contact" },
];

export default function AboutPage() {
  return (
    <LegalLayout
      title="About OpenMarket"
      effectiveDate="2026-04-30"
      version="v2026.04.30"
      toc={TOC}
    >
      <p className="lead">
        OpenMarket is a viewpoint-neutral Android app marketplace. We host what
        is legal, what is signed, and what is honestly described — and we tell
        you exactly why anything is removed.
      </p>

      <h2 id="mission">Mission</h2>
      <p>
        Two large mobile platforms decide what a billion people get to install
        on the device they paid for. Their decisions are inconsistent, opaque,
        and increasingly political. Apps get removed for being unpopular, for
        being inconvenient, or simply because nobody at the platform thought
        about them.
      </p>
      <p>
        OpenMarket exists because that's not how a marketplace should work. We
        believe a healthy app ecosystem needs:
      </p>
      <ul>
        <li>
          Clear, written rules — narrow, specific, and applied evenly.
        </li>
        <li>
          A public log of every moderation decision, with the reason given
          and the rule cited.
        </li>
        <li>
          Real due process for developers: written notice, an appeal, a
          published response.
        </li>
        <li>
          Trust signals based on what an app actually does, not editorial
          favorites.
        </li>
      </ul>

      <h2 id="principles">Principles</h2>
      <ol>
        <li>
          <strong>Viewpoint-neutral by default.</strong> We remove for narrow,
          published reasons — never for being controversial.
        </li>
        <li>
          <strong>Transparency log is public.</strong> Every action has a
          public record.
        </li>
        <li>
          <strong>Developer due process.</strong> No takedown without notice
          (with limited safety exceptions). All takedowns are appealable.
        </li>
        <li>
          <strong>No editorial favoritism in core ranking.</strong> Featured
          surfaces are clearly labeled. Default search uses objective signals.
        </li>
        <li>
          <strong>Trust through signals, not gatekeeping.</strong> Real signals
          appear on every listing — verified developer, signed by known key,
          source code linked, scan results.
        </li>
        <li>
          <strong>Privacy by default.</strong> No third-party trackers in the
          storefront. Accounts are optional for browsing/installing. Telemetry
          is minimum-necessary and opt-in for anything beyond install
          success/failure.
        </li>
      </ol>
      <p>
        The full set is documented in the{" "}
        <a
          href="https://github.com/lawrencema000-gif/openmarket/blob/main/docs/IMPLEMENTATION-PLAN.md"
          target="_blank"
          rel="noreferrer"
        >
          implementation plan
        </a>
        . Anything that conflicts with these principles loses.
      </p>

      <h2 id="open-source">Open source</h2>
      <p>
        OpenMarket the platform is open source. The code that runs the
        marketplace, the moderation tooling, the security scanners — all of it
        is public on GitHub:
      </p>
      <ul>
        <li>
          <a
            href="https://github.com/lawrencema000-gif/openmarket"
            target="_blank"
            rel="noreferrer"
          >
            github.com/lawrencema000-gif/openmarket
          </a>
        </li>
      </ul>
      <p>
        We accept contributions, bug reports, security disclosures (see{" "}
        <Link href="/security">Security</Link>), and proposals for changes to
        the <Link href="/content-policy">Content Policy</Link>.
      </p>

      <h2 id="team">Team</h2>
      <p>
        OpenMarket is being built in public. The maintainer list is in the
        repository.
      </p>

      <h2 id="contact">Contact</h2>
      <ul>
        <li>
          General:{" "}
          <a href="mailto:hello@openmarket.app">hello@openmarket.app</a>
        </li>
        <li>
          Press:{" "}
          <a href="mailto:press@openmarket.app">press@openmarket.app</a>
        </li>
        <li>
          Trust & safety:{" "}
          <a href="mailto:trust@openmarket.app">trust@openmarket.app</a>
        </li>
        <li>
          Security:{" "}
          <a href="mailto:security@openmarket.app">security@openmarket.app</a>
        </li>
        <li>
          Legal / DMCA:{" "}
          <a href="mailto:legal@openmarket.app">legal@openmarket.app</a>
        </li>
      </ul>
    </LegalLayout>
  );
}
