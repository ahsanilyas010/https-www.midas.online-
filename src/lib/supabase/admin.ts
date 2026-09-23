import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Service-role client. Bypasses RLS entirely — use only in server actions /
// route handlers that themselves enforce the caller's permission (e.g. user
// provisioning, password reset issuance). Never import this from a Client
// Component; the `server-only` import makes that a build error.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
