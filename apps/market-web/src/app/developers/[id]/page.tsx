import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, TrustBadge, Badge } from "@openmarket/ui";
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
      title: `${dev.displayName ?? "Developer"} — OpenMarket`,
      description: `Apps by ${dev.displayName} on OpenMarket`,
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

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Developer header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-gray-900">{developer.name}</h1>
        {developer.trustLevel && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Trust level:</span>
            <Badge variant="secondary">{developer.trustLevel}</Badge>
          </div>
        )}
        {developer.trustBadges && developer.trustBadges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {developer.trustBadges.map((badge) => (
              <TrustBadge key={badge} type={badge} />
            ))}
          </div>
        )}
        {developer.memberSince && (
          <p className="text-sm text-gray-500">
            Member since {new Date(developer.memberSince).toLocaleDateString("en-US", { year: "numeric", month: "long" })}
          </p>
        )}
        {developer.bio && (
          <p className="text-gray-700">{developer.bio}</p>
        )}
        {developer.website && (
          <a
            href={developer.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            {developer.website}
          </a>
        )}
      </div>

      {/* Apps by this developer */}
      {developer.apps && developer.apps.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Apps ({developer.apps.length})
          </h2>
          <div className="space-y-3">
            {developer.apps.map((app) => (
              <Link key={app.id} href={`/apps/${app.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-4">
                      {app.iconUrl ? (
                        <img src={app.iconUrl} alt={app.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded-xl shrink-0" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{app.name}</span>
                          {app.category && <Badge variant="secondary" className="text-xs">{app.category}</Badge>}
                        </div>
                        {app.shortDescription && (
                          <p className="text-sm text-gray-500 line-clamp-1">{app.shortDescription}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(!developer.apps || developer.apps.length === 0) && (
        <p className="text-gray-500 text-sm">No published apps yet.</p>
      )}
    </div>
  );
}
