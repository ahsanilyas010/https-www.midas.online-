import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";

// The real, RLS-governed Supabase client — for Phase 1's new surfaces
// only: identity/auth (requireProfile, requirePlatformAdmin), onboarding,
// branding, and the platform admin pages. Everything else in the app
// (the pre-existing CRM pages and actions) uses the shared createClient()
// in ./server.ts instead, which is intentionally still backed by the
// in-memory demo/workspace store — see that file's header comment for why.
export async function createRealClient(): Promise<SupabaseClient<RealDatabase>> {
  const cookieStore = await cookies();

  return createServerClient<RealDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Read-only cookie jar (Server Component render) — middleware
            // refreshes the session on the next request instead.
          }
        },
      },
    },
  );
}
