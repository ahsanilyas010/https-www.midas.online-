import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createDemoClient } from "@/lib/demo/client";
import type { DemoStore } from "@/lib/demo/store";

// Service-role client. Bypasses RLS entirely — use only in server actions /
// route handlers that themselves enforce the caller's permission (e.g. user
// provisioning, password reset issuance). Never import this from a Client
// Component; the `server-only` import makes that a build error.
//
// DEMO BUILD: backed by the in-memory store with RLS bypassed. Pass a
// customer workspace's store to act on that workspace instead of the demo.
export function createAdminClient(store?: DemoStore): SupabaseClient<Database> {
  return createDemoClient({
    bypassRls: true,
    workspace: store ? { store, userId: "", email: "" } : undefined,
  }) as unknown as SupabaseClient<Database>;
}
