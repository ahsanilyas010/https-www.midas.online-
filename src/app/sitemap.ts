import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// /sitemap.xml — the public, indexable pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/pricing"), lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: absoluteUrl("/contact"), lastModified, changeFrequency: "yearly", priority: 0.7 },
    { url: absoluteUrl("/login"), lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
