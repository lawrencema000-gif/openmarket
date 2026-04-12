import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Card, CardHeader, CardTitle, CardContent,
  TrustBadge, Badge, Button,
} from "@openmarket/ui";
import type { TrustBadgeType } from "@openmarket/ui";

interface Developer {
  id: string;
  name: string;
  trustLevel?: string;
}

interface AppDetail {
  id: string;
  name: string;
  description?: string;
  shortDescription?: string;
  iconUrl?: string;
  screenshots?: string[];
  permissions?: string[];
  trustBadges?: TrustBadgeType[];
  version?: string;
  packageName?: string;
  apkUrl?: string;
  category?: string;
  developer: Developer;
}

interface Review {
  id: string;
  rating: number;
  comment?: string;
  author?: string;
  createdAt?: string;
}

async function getApp(id: string): Promise<AppDetail | null> {
  try {
    return await apiFetch<AppDetail>(`/api/apps/${id}`);
  } catch {
    return null;
  }
}

async function getReviews(appId: string): Promise<Review[]> {
  try {
    return await apiFetch<Review[]>(`/api/apps/${appId}/reviews`);
  } catch {
    return [];
  }
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-yellow-500">
      {"★".repeat(Math.min(5, Math.max(0, Math.round(rating))))}
      {"☆".repeat(Math.max(0, 5 - Math.round(rating)))}
    </span>
  );
}

export default async function AppDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [app, reviews] = await Promise.all([getApp(id), getReviews(id)]);

  if (!app) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* App header */}
      <div className="flex items-start gap-6">
        {app.iconUrl ? (
          <img src={app.iconUrl} alt={app.name} className="w-24 h-24 rounded-2xl object-cover shrink-0" />
        ) : (
          <div className="w-24 h-24 bg-gray-200 rounded-2xl shrink-0 flex items-center justify-center text-gray-400 text-sm">
            APK
          </div>
        )}
        <div className="flex-1 space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{app.name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {app.category && <Badge variant="secondary">{app.category}</Badge>}
            {app.version && <span className="text-sm text-gray-500">v{app.version}</span>}
          </div>
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <span>by</span>
            <Link href={`/developers/${app.developer.id}`} className="text-blue-600 hover:underline font-medium">
              {app.developer.name}
            </Link>
          </div>
          {app.trustBadges && app.trustBadges.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {app.trustBadges.map((badge) => (
                <TrustBadge key={badge} type={badge} />
              ))}
            </div>
          )}
          <div className="pt-2">
            <a
              href={app.apkUrl ?? "#"}
              className={`inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors ${!app.apkUrl ? "opacity-50 pointer-events-none" : ""}`}
              download={app.apkUrl ? true : undefined}
            >
              Download APK
              {!app.apkUrl && <span className="text-xs opacity-75">(unavailable)</span>}
            </a>
          </div>
        </div>
      </div>

      {/* Description */}
      {app.description && (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 whitespace-pre-wrap">{app.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Screenshots */}
      {app.screenshots && app.screenshots.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">Screenshots</h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {app.screenshots.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Screenshot ${i + 1}`}
                className="h-64 w-auto rounded-lg object-cover shrink-0 border border-gray-200"
              />
            ))}
          </div>
        </section>
      )}

      {/* Permissions */}
      {app.permissions && app.permissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Permissions Required</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {app.permissions.map((perm) => (
                <li key={perm} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full shrink-0" />
                  {perm}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Package info */}
      {app.packageName && (
        <div className="text-sm text-gray-500">
          Package: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">{app.packageName}</code>
        </div>
      )}

      {/* Reviews */}
      <section>
        <h2 className="text-xl font-semibold mb-4">
          Reviews {reviews.length > 0 && <span className="text-base font-normal text-gray-500">({reviews.length})</span>}
        </h2>
        {reviews.length === 0 ? (
          <p className="text-gray-500 text-sm">No reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StarRating rating={review.rating} />
                      <span className="text-sm font-medium text-gray-700">{review.author ?? "Anonymous"}</span>
                    </div>
                    {review.createdAt && (
                      <span className="text-xs text-gray-400">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {review.comment && <p className="text-sm text-gray-600 mt-1">{review.comment}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
