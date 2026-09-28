// CLI entrypoint: `npm run seed` (tsx scripts/seed.ts). Thin wrapper around
// src/lib/seed/run.ts so the same seeding logic is callable both from here
// and from the in-app "reset demo data" server action
// (src/lib/actions/demo.ts).
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { seedPlatformAdmins, seedAssortedWorkspace, seedDemoWorkspace } from "@/lib/seed/run";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("seed: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const admin = createClient<RealDatabase>(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const adminCount = await seedPlatformAdmins(admin);
  console.log(`seed: ${adminCount} platform admin(s) attached.`);

  const assortedId = await seedAssortedWorkspace(admin);
  console.log(assortedId ? `seed: assorted workspace ready (${assortedId}).` : "seed: assorted workspace skipped.");

  const demoId = await seedDemoWorkspace(admin, { reset: process.argv.includes("--reset") });
  console.log(`seed: demo workspace ready (${demoId}).`);
}

main().catch((err) => {
  console.error("seed: failed", err);
  process.exit(1);
});
