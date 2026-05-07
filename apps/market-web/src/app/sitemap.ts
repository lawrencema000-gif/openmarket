import type { MetadataRoute } from "next";
import { apiFetch } from "@/lib/api";
import { SITE_URL } from "@/lib/site";

interface SitemapApp {
  id: string;
  packageName: string;
  updatedAt: string | Date;
}

interface SitemapCategory {
  slug: string;
  name: string;
}

/**
 * Sitemap generation. Streams the published-app catalog from the API
 * (paged 200 at a time) and emits one URL per:
 *   - app detail page
 *   - category detail page (one per known slug, featured or not)
 *   - the canonical legal/static surfaces
 *
 * Google caps a single sitemap at 50k URLs / 50 MB. We page the API up
 * to a hard ceiling (5000 here — generous for now; raise + chunk into
 * sitemap-index later when we cross 50k apps).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [apps, categories] = await Promise.all([
    fetchAllApps(),
    fetchCategories(),
  ]);

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    {
      url: `${SITE_URL}/categories`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/transparency-report`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/content-policy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/anti-features`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/dmca`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/security`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${SITE_URL}/categories/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const appEntries: MetadataRoute.Sitemap = apps.map((a) => ({
    url: `${SITE_URL}/apps/${a.id}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...categoryEntries, ...appEntries];
}

async function fetchAllApps(): Promise<SitemapApp[]> {
  const out: SitemapApp[] = [];
  const limit = 200;
  const maxPages = 25; // hard ceiling — 5000 apps; raise + index later.
  for (let page = 1; page <= maxPages; page++) {
    try {
      const r = await apiFetch<{ items: SitemapApp[] }>(
        `/api/apps/sitemap?page=${page}&limit=${limit}`,
      );
      if (!r.items.length) break;
      out.push(...r.items);
      if (r.items.length < limit) break;
    } catch {
      break;
    }
  }
  return out;
}

async function fetchCategories(): Promise<SitemapCategory[]> {
  try {
    return await apiFetch<SitemapCategory[]>("/api/categories");
  } catch {
    return [];
  }
}
