import type { NextConfig } from "next";

const securityHeaders = [
  // HTTPS only (Vercel serves HTTPS and redirects HTTP; HSTS tells browsers
  // to never try HTTP again).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Permanent (308) redirects for URLs people are likely to type or link to.
  async redirects() {
    return [
      // Browsers and crawlers ask for /favicon.ico; the icon is generated at /icon.
      { source: "/favicon.ico", destination: "/icon", permanent: true },
      { source: "/home", destination: "/", permanent: true },
      { source: "/index", destination: "/", permanent: true },
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/demo", destination: "/login", permanent: true },
      { source: "/try", destination: "/login", permanent: true },
      { source: "/signin", destination: "/login", permanent: true },
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/features", destination: "/#features", permanent: true },
    ];
  },
};

export default nextConfig;
