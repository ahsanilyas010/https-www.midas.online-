"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEMO_COOKIE } from "@/lib/demo/client";
import { resetStore, getStore } from "@/lib/demo/store";
import { DEMO_PERSONAS } from "@/lib/demo/seed";

// One-click sign-in as a seeded persona — the demo has no passwords.
export async function signInAsPersona(personaId: string, next?: string) {
  const persona = DEMO_PERSONAS.find((p) => p.id === personaId);
  const profile = getStore().tables.profiles.find((p) => p.id === personaId);
  if (!persona && !profile) return { error: "Unknown demo user." };
  const jar = await cookies();
  jar.set(DEMO_COOKIE, personaId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 7 });
  redirect(next && next.startsWith("/") ? next : "/");
}

// Switch persona from inside the app without going back to the login page.
export async function switchPersona(personaId: string) {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, personaId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 7 });
  redirect("/");
}

// Re-seed every table — undoes whatever the audience clicked during a demo.
export async function resetDemoData() {
  resetStore();
  revalidatePath("/", "layout");
  return { ok: true };
}
