import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// A platform_admin has no workspace/profiles row (spec: "platform_admins is
// a separate table outside any workspace"), so this route group
// deliberately doesn't go through (app)/layout.tsx's requireProfile() — it
// has its own minimal chrome and its own gate (requirePlatformAdmin(), in
// each page).
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>;
}
