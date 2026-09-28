import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServiceClient } from "@/lib/supabase/service";

// Section 7, Phase 8 — "Rate limiting on all mutation endpoints." Applied
// here to the endpoints reachable without authentication, where abuse risk
// is highest: login (brute force), the public inbound web form (spam/
// scripted submission), and the public unsubscribe link. Authenticated
// mutations are already behind Supabase auth + RLS + role checks, which is
// the higher-value control for those; this DB-backed fixed-window counter
// is the piece that was missing for the endpoints anyone on the internet
// can reach directly.
//
// Two backends, matching src/lib/supabase/server.ts's split: checkRateLimit()
// is for the pre-existing demo/workspace-store endpoints (leads/inbound,
// unsubscribe) and simulates the counter the same way it always has.
// checkRealRateLimit() is for Phase 1's new real-Postgres flows (signup,
// real login) and calls the real check_rate_limit() RPC from migration
// 00000000000038.
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  maxHits: number,
  windowSeconds: number,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_identifier: identifier,
    p_max_hits: maxHits,
    p_window_seconds: windowSeconds,
  });
  // Fail open on an infra error — a broken rate limiter should not take
  // down login or lead capture. The endpoints it protects are already
  // gated by other checks (Supabase Auth's own throttling, consent
  // validation, honeypot).
  if (error) return true;
  return data === true;
}

export async function checkRealRateLimit(
  bucket: string,
  identifier: string,
  maxHits: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_identifier: identifier,
      p_max_hits: maxHits,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data === true;
  } catch {
    // Fail open — e.g. Supabase env vars not yet configured on a
    // demo-only deployment that still exposes the real signup form.
    return true;
  }
}
