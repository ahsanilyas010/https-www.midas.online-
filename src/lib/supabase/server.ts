import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createDemoClient } from "@/lib/demo/client";
import { getWorkspaceContext } from "@/lib/accounts/session";

// Server Component / Server Action / Route Handler client.
//
// Two audiences share this one function:
//  - A real, signed-up workspace (identity now lives in real Postgres —
//    see src/lib/accounts/session.ts) gets the in-memory demo client
//    scoped to their own workspace's store, so every existing CRM page and
//    action (campaigns, leads, calls, attendance, QA, dialer, ...) keeps
//    working exactly as it does today. Those features move to real
//    Postgres one at a time, in their own later phases — not in Phase 1.
//  - Everyone else (a sales-demo persona cookie, or no session at all)
//    gets the shared global demo dataset.
//
// Phase 1's own new surfaces (auth/identity, onboarding, branding,
// platform admin) do NOT use this function — they use the real,
// RLS-governed client in src/lib/supabase/real.ts instead.
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const wsCtx = await getWorkspaceContext();

  const client = createDemoClient({
    workspace: wsCtx ? { store: wsCtx.store, userId: wsCtx.member.uid, email: wsCtx.member.email } : undefined,
    jar: {
      get: (name) => cookieStore.get(name)?.value,
      set: (name, value) => {
        try {
          cookieStore.set(name, value, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 7 });
        } catch {
          // Read-only cookie jar (Server Component render) — ignore.
        }
      },
      delete: (name) => {
        try {
          cookieStore.delete(name);
        } catch {
          // Read-only cookie jar — ignore.
        }
      },
    },
  });

  return client as unknown as SupabaseClient<Database>;
}
