"use client";

import { useEffect } from "react";

// First-touch ad attribution. An ad click lands on any public page with
// ?utm_…&fbclid=…; this keeps those values (and the referrer and landing
// page) so the sign-up form can save them with the new workspace even if
// the visitor browses around first.

const KEY = "callmilalo_attribution";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"] as const;

export type Attribution = Partial<Record<(typeof PARAMS)[number] | "referrer" | "landing_path", string>>;

export function readAttribution(): Attribution {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Attribution;
  } catch {
    return {};
  }
}

export function AttributionCapture() {
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const fromUrl: Attribution = {};
      for (const p of PARAMS) {
        const v = url.searchParams.get(p);
        if (v) fromUrl[p] = v;
      }
      const existing = readAttribution();
      // A new ad click replaces the old attribution; plain visits keep it.
      if (Object.keys(fromUrl).length > 0 || Object.keys(existing).length === 0) {
        const ref = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : undefined;
        localStorage.setItem(KEY, JSON.stringify({ ...fromUrl, referrer: ref, landing_path: url.pathname }));
      }
    } catch {
      // Storage blocked (private mode etc.) — attribution is best-effort.
    }
  }, []);
  return null;
}
