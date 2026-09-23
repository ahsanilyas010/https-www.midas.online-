import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// /manifest.webmanifest — install metadata and theme colour for mobile.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.productName,
    short_name: BRAND.productName,
    description: BRAND.seoDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#0d0a2b",
    theme_color: "#4338ca",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
