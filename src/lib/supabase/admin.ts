import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createDemoClient } from "@/lib/demo/client";
import type { DemoStore } from "@/lib/demo/store";

// Service-role client for the in-memory demo/workspace CRM data model.
// Bypasses that store's RLS simulation entirely — use only in server
// actions / route handlers that themselves enforce the caller's
// permission. Never import this from a Client Component; the
// `server-only` import makes that a build error.
//
// Pass a real customer workspace's store to act on that workspace instead
// of the shared demo dataset. For real Postgres service-role access
// (Phase 1's new surfaces: signup, account provisioning, rate limiting,
// seeding), use src/lib/supabase/service.ts's createServiceClient()
// instead — this function never touches real Postgres.
export function createAdminClient(store?: DemoStore): SupabaseClient<Database> {
  return createDemoClient({
    bypassRls: true,
    workspace: store ? { store, userId: "", email: "" } : undefined,
  }) as unknown as SupabaseClient<Database>;
}
