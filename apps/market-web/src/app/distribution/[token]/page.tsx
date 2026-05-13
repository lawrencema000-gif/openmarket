import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { ServiceUnavailable } from "@openmarket/ui";

interface PinnedRelease {
  id: string;
  versionName: string;
  versionCode: number;
  channel: string;
  status: string;
  releaseNotes: string | null;
  publishedAt: string | null;
  apkUrl: string | null;
  apkSha256: string | null;
}

interface DistributionPayload {
  channel: {
    id: string;
    name: string;
    description: string | null;
    expiresAt: string | null;
  };
  app: {
    id: string;
    title: string;
    packageName: string | null;
    iconUrl: string | null;
  };
  releases: PinnedRelease[];
}

type Result =
  | { kind: "ok"; data: DistributionPayload }
  | { kind: "missing" }
  | { kind: "gone"; reason: string }
  | { kind: "unavailable"; reason: string };

async function getChannel(token: string): Promise<Result> {
  try {
    const data = await apiFetch<DistributionPayload>(
      `/api/distribution/${encodeURIComponent(token)}`,
    );
    return { kind: "ok", data };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) return { kind: "missing" };
      if (err.status === 410) return { kind: "gone", reason: err.message };
      if (err.isUnreachable) return { kind: "unavailable", reason: err.message };
    }
    return { kind: "unavailable", reason: "Unknown error" };
  }
}

// Always-noindex — private channels must not be crawled.
export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  title: "Private distribution channel",
};

export default async function DistributionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getChannel(token);

  if (result.kind === "missing") notFound();

  if (result.kind === "unavailable") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <ServiceUnavailable
          title="Can't load this channel"
          description="The OpenMarket API is temporarily unreachable. Refresh in a minute."
        />
      </div>
    );
  }

  if (result.kind === "gone") {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Link unavailable</h1>
        <p className="text-sm text-gray-600">{result.reason}</p>
        <p className="text-xs text-gray-400">
          Ask the developer for a new share link.
        </p>
      </div>
    );
  }

  const { channel, app, releases } = result.data;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <header className="flex items-start gap-4">
        {app.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.iconUrl}
            alt=""
            className="w-16 h-16 rounded-xl object-cover border border-gray-200 shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wide font-semibold text-indigo-600">
            Private distribution channel
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{channel.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            for <strong>{app.title}</strong>
            {app.packageName ? (
              <span className="ml-2 font-mono text-xs text-gray-400">
                {app.packageName}
              </span>
            ) : null}
          </p>
        </div>
      </header>

      {channel.description ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
          {channel.description}
        </section>
      ) : null}

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1">
        <p className="font-semibold">This is a private link.</p>
        <p>
          The builds below may not have passed OpenMarket's public review.
          Install at your own risk and only on test devices.
        </p>
        {channel.expiresAt ? (
          <p className="text-[11px] text-amber-700 mt-1">
            Expires {new Date(channel.expiresAt).toLocaleString()}.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Available builds
        </h2>
        {releases.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No builds are pinned to this channel yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {releases.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-gray-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <p className="font-medium text-gray-900">
                    v{r.versionName}{" "}
                    <span className="text-xs text-gray-400 font-mono">
                      (build {r.versionCode})
                    </span>
                  </p>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {r.channel} · {r.status}
                  </span>
                </div>
                {r.releaseNotes ? (
                  <p className="text-xs text-gray-600 whitespace-pre-wrap">
                    {r.releaseNotes}
                  </p>
                ) : null}
                {r.apkUrl ? (
                  <a
                    href={r.apkUrl}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5"
                  >
                    Download APK
                  </a>
                ) : (
                  <p className="text-[11px] text-amber-700">
                    APK not yet uploaded for this build.
                  </p>
                )}
                {r.apkSha256 ? (
                  <p className="text-[10px] font-mono text-gray-400 break-all">
                    SHA256 {r.apkSha256}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[11px] text-gray-400 text-center pt-4 border-t border-gray-100">
        <Link href="/" className="hover:text-gray-600">
          OpenMarket home
        </Link>
        {" — "}
        Don't share this link publicly.
      </p>
    </div>
  );
}
