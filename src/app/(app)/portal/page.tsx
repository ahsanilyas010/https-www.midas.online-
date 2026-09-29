import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getClientPortalData } from "@/lib/actions/client-portal";
import { PortalClient } from "./portal-client";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Real-workspace client portal (Phase 7) — separate from the legacy demo
// /client. Read-only, never a phone number or recording (the underlying
// SECURITY DEFINER functions structurally can't return one).
export default async function ClientPortalPage() {
  const profile = await requireRealProfile();
  if (profile.role !== "client") redirect("/start");

  const data = await getClientPortalData(true);
  return <PortalClient initialData={data} />;
}
