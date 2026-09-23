import type { MetadataRoute } from "next";
import { PRIVATE_PATH_PREFIXES, absoluteUrl } from "@/lib/site";

// /robots.txt — crawl the marketing page, keep the demo app out of search.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Prefix match: "/admin" also covers "/admin/…".
        disallow: PRIVATE_PATH_PREFIXES,
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
