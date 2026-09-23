import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// /sitemap.xml — the public, indexable pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/pricing"), lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/contact"), lastModified, changeFrequency: "yearly", priority: 0.7 },
    { url: absoluteUrl("/signup"), lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/terms"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/login"), lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
