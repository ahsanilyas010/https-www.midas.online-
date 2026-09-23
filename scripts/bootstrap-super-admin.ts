/**
 * One-time bootstrap: create the first super_admin account.
 *
 * There's a chicken-and-egg problem in the provisioning flow (section 3.1):
 * only a super_admin/ops_manager can create users through the app, but no
 * users exist yet. This script uses the service-role Admin API directly —
 * the same supported path the app's own createUser server action uses —
 * to create exactly one account.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     npx tsx scripts/bootstrap-super-admin.ts --email you@example.com --name "Your Name"
 *
 * Or just make sure .env.local has NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY set, then: npx tsx scripts/bootstrap-super-admin.ts
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { config } from "dotenv";

config({ path: ".env.local" });

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateTempPassword(length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const fullName = arg("name") ?? "Super Admin";
  const agentCode = arg("code") ?? "ABPO-001";

  if (!email) {
    console.error("Usage: npx tsx scripts/bootstrap-super-admin.ts --email you@example.com --name \"Your Name\"");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local or env).");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    console.error("Failed to create auth user:", createError?.message);
    process.exit(1);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    agent_code: agentCode,
    role: "super_admin",
    must_change_password: true,
  });

  if (profileError) {
    console.error("Failed to create profile row:", profileError.message);
    await admin.auth.admin.deleteUser(created.user.id);
    process.exit(1);
  }

  await admin.from("credential_events").insert([
    { user_id: created.user.id, event: "created", note: "bootstrap script" },
    { user_id: created.user.id, event: "temp_issued", note: "bootstrap script" },
  ]);

  console.log("\nSuper admin created.");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${tempPassword}  (shown once — record it now)`);
  console.log("\nYou'll be forced to set a new password on first login.\n");
}

main();
