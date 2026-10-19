import "server-only";
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
// Backed by the check_rate_limit() RPC (migration 00000000000038), called
// with the service role since the endpoints it guards are unauthenticated.
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  maxHits: number,
  windowSeconds: number,
): Promise<boolean> {
  return checkRealRateLimit(bucket, identifier, maxHits, windowSeconds);
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
