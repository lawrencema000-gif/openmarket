import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  PageHeader, AppCard, TrustBadge, Card, CardContent, Badge
} from "@openmarket/ui";
import type { TrustBadgeType } from "@openmarket/ui";

interface DeveloperProfile {
  id: string;
  name: string;
  trustLevel?: string;
  trustBadges?: TrustBadgeType[];
  bio?: string;
  website?: string;
  memberSince?: string;
  apps?: Array<{
    id: string;
    name: string;
    shortDescription?: string;
    iconUrl?: string;
    category?: string;
    trustTier?: string;
    isExperimental?: boolean;
    rating?: number;
  }>;
}

async function getDeveloper(id: string): Promise<DeveloperProfile | null> {
  try {
    return await apiFetch<DeveloperProfile>(`/api/developers/${id}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const dev = await apiFetch<any>(`/api/developers/${id}`);
    return {
      title: `${dev.name ?? dev.displayName ?? "Developer"} — OpenMarket`,
      description: `Apps by ${dev.name ?? dev.displayName} on OpenMarket`,
    };
  } catch {
    return { title: "Developer — OpenMarket" };
  }
}

export default async function DeveloperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const developer = await getDeveloper(id);

  if (!developer) {
    notFound();
  }

  const appCount = developer.apps?.length ?? 0;
  const memberSinceYear = developer.memberSince
    ? new Date(developer.memberSince).getFullYear()
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-900 transition-colors">Home</Link>
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-gray-900 font-medium">{developer.name}</span>
      </nav>

      {/* Developer header */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-3xl font-bold text-white shadow-md shrink-0">
          {developer.name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{developer.name}</h1>
            {developer.bio && (
              <p className="text-gray-500 mt-1.5 leading-relaxed">{developer.bio}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {developer.trustLevel && (
              <Badge variant="secondary">{developer.trustLevel}</Badge>
            )}
            {developer.trustBadges && developer.trustBadges.length > 0 && developer.trustBadges.map((badge) => (
              <TrustBadge key={badge} type={badge} />
            ))}
          </div>

          {developer.website && (
            <a
              href={developer.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:underline font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              {developer.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-3xl font-bold text-gray-900">{appCount}</p>
          <p className="text-sm text-gray-500 mt-0.5">Published {appCount === 1 ? "App" : "Apps"}</p>
        </div>
        {memberSinceYear && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-3xl font-bold text-gray-900">{memberSinceYear}</p>
            <p className="text-sm text-gray-500 mt-0.5">Member Since</p>
          </div>
        )}
        {developer.trustLevel && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-center">
            <p className="text-lg font-bold text-blue-600">{developer.trustLevel}</p>
            <p className="text-sm text-gray-500 mt-0.5">Trust Level</p>
          </div>
        )}
      </div>

      {/* Apps section */}
      {appCount > 0 ? (
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-5 tracking-tight">
            Apps by {developer.name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {developer.apps!.map((app) => (
              <Link key={app.id} href={`/apps/${app.id}`} className="block">
                <AppCard
                  id={app.id}
                  title={app.name}
                  iconUrl={app.iconUrl ?? ""}
                  developerName={developer.name}
                  shortDescription={app.shortDescription ?? ""}
                  category={app.category ?? ""}
                  trustTier={app.trustTier ?? "new"}
                  isExperimental={app.isExperimental}
                  rating={app.rating}
                  variant="grid"
                />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" />
            </svg>
          </div>
          <p className="font-semibold text-gray-700">No published apps yet</p>
          <p className="text-sm text-gray-400 mt-1">This developer hasn't published any apps yet.</p>
        </div>
      )}
    </div>
  );
}
