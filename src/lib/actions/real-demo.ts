"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createRealClient } from "@/lib/supabase/real";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRealRateLimit } from "@/lib/rate-limit";
import { seedDemoWorkspace } from "@/lib/seed/run";
import { DEMO_PASSWORD, DEMO_PERSONAS, DEMO_ROLE_LABEL } from "@/lib/seed/personas";

// Spec, Phase 9: "DEMO_MODE=true enables a role switcher on the sign-in
// page that logs into the demo workspace as any role... The role switcher
// never appears for other workspaces." This is the REAL, Postgres-backed
// "demo" workspace (is_demo=true, seeded by npm run seed) — a separate,
// opt-in capability from the pre-existing sales-demo persona picker
// (src/lib/actions/demo.ts, the in-memory store), which stays the
// default experience visitors see. This one only ever renders when
// NEXT_PUBLIC_DEMO_MODE=true is explicitly set.

export interface RealDemoPersona {
  email: string;
  fullName: string;
  role: string;
  roleLabel: string;
}

export async function getRealDemoPersonas(): Promise<RealDemoPersona[]> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return [];
  return DEMO_PERSONAS.map((p) => ({ email: p.email, fullName: p.fullName, role: p.role, roleLabel: DEMO_ROLE_LABEL[p.role] }));
}

export async function signInAsRealDemoPersona(email: string): Promise<{ error?: string }> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return { error: "Not available." };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRealRateLimit("real-demo-signin", ip, 20, 300))) {
    return { error: "Too many attempts. Wait a few minutes and try again." };
  }

  // Only ever an email from the real demo workspace's own fixed roster —
  // never an arbitrary address, so this can't become a password-guessing
  // oracle against real customer accounts.
  if (!DEMO_PERSONAS.some((p) => p.email === email)) {
    return { error: "Unknown demo persona." };
  }

  const supabase = await createRealClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) return { error: "Could not sign in. Has `npm run seed` been run against this project?" };

  redirect("/start");
}

export async function resetRealDemoWorkspace(): Promise<{ error?: string }> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return { error: "Not available." };
  const admin = createServiceClient();
  await seedDemoWorkspace(admin, { reset: true });
  revalidatePath("/", "layout");
  return {};
}
