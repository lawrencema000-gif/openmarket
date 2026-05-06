import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Don't index user-side dashboards or auth flows — they 401 to
        // crawlers anyway, but keeping them out of the index avoids
        // wasted crawl budget + accidental cache of an error state.
        disallow: ["/account", "/library", "/wishlist", "/login", "/auth"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
