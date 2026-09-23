"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { accounts, AccountError, type SignupSource } from "@/lib/accounts";
import { setSessionCookie } from "@/lib/accounts/session";
import { checkRateLimit } from "@/lib/rate-limit";

export interface SignupState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"full_name" | "company" | "email" | "password" | "agree", string>>;
  values?: { full_name?: string; company?: string; email?: string; phone?: string; team_size?: string };
}

const TEAM_SIZES = ["1-3", "4-10", "11-50", "51-200", "200+"] as const;

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your name.").max(80),
  company: z.string().trim().min(2, "Enter your company name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid work email."),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
  phone: z.string().trim().max(30).optional(),
  team_size: z.enum(TEAM_SIZES).optional(),
  agree: z.literal("on", { message: "Please accept the terms to continue." }),
});

const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "referrer", "landing_path"] as const;

// Creates the customer's workspace (free plan, 3 agent seats), makes them
// its super admin and signs them in. The client then fires the ad pixel's
// CompleteRegistration event and opens the app.
export async function signUp(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const values = { full_name: raw.full_name, company: raw.company, email: raw.email, phone: raw.phone, team_size: raw.team_size };

  // Honeypot: people never see this field; form-filling bots do.
  if (raw.website) return { ok: false, error: "Something went wrong. Please try again.", values };

  const parsed = schema.safeParse({
    ...raw,
    phone: raw.phone || undefined,
    team_size: raw.team_size || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<SignupState["fieldErrors"]>;
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, values };
  }
  const input = parsed.data;

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await checkRateLimit("signup", ip, 5, 60 * 60))) {
    return { error: "Too many sign-ups from this network. Try again in an hour.", values };
  }

  const signup: SignupSource = {};
  for (const k of SOURCE_KEYS) {
    const v = raw[k]?.trim();
    if (v) signup[k] = v.slice(0, 300);
  }

  try {
    const backend = accounts();
    await backend.createWorkspace({
      email: input.email,
      password: input.password,
      fullName: input.full_name,
      workspaceName: input.company,
      teamSize: input.team_size ?? null,
      phone: input.phone ?? null,
      signup,
    });
    const session = await backend.signIn(input.email, input.password);
    await setSessionCookie(session.token, session.maxAgeSeconds);
  } catch (e) {
    if (e instanceof AccountError) {
      if (e.code === "email_exists") return { fieldErrors: { email: "There's already an account with this email. Sign in instead." }, values };
      if (e.code === "weak_password") return { fieldErrors: { password: e.message }, values };
      return { error: e.message, values };
    }
    console.error("signup failed", e);
    return { error: "We couldn't create your account just now. Please try again.", values };
  }
  return { ok: true };
}
