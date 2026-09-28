import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";

// The real service-role client, bypassing RLS against real Postgres —
// distinct from ./admin.ts's createAdminClient(), which bypasses RLS
// against the in-memory demo/workspace store instead. Used only by Phase
// 1's real-Postgres surfaces: signup, src/lib/accounts/index.ts's member/
// workspace mutations, rate limiting, and the seed scripts.
export function createServiceClient(): SupabaseClient<RealDatabase> {
  return createClient<RealDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
