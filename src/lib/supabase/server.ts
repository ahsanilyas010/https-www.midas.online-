import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createDemoClient } from "@/lib/demo/client";

// Server Component / Server Action / Route Handler client.
//
// DEMO BUILD: there is no database connection. This returns an in-memory
// client (src/lib/demo) that implements the same query-builder API over a
// seeded dataset, so every page and action keeps its original Supabase
// code. The signed-in demo user comes from the `callmilalo_demo_user` cookie.
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  const client = createDemoClient({
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
