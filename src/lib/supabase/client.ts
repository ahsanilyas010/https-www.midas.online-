import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

// Browser client, for Client Components (branding upload, Supabase Auth
// calls, and Realtime subscriptions such as the follow-up tray).
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
