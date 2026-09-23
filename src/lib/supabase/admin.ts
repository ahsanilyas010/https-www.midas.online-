import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createDemoClient } from "@/lib/demo/client";

// Service-role client. Bypasses RLS entirely — use only in server actions /
// route handlers that themselves enforce the caller's permission (e.g. user
// provisioning, password reset issuance). Never import this from a Client
// Component; the `server-only` import makes that a build error.
//
// DEMO BUILD: backed by the in-memory store with RLS bypassed.
export function createAdminClient(): SupabaseClient<Database> {
  return createDemoClient({ bypassRls: true }) as unknown as SupabaseClient<Database>;
}
