"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";

export interface BrandingState {
  error?: string;
  ok?: boolean;
}

const schema = z.object({
  brand_logo_url: z.string().trim().optional(),
  brand_primary_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #4f46e5.")
    .optional()
    .or(z.literal("")),
  brand_product_name: z.string().trim().max(60).optional(),
});

// Shared by the onboarding wizard's brand step and the post-onboarding
// admin/settings/branding page — both call this same action.
export async function updateBranding(_prev: BrandingState, formData: FormData): Promise<BrandingState> {
  const profile = await requireRealProfile();
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") {
    return { error: "Only an admin can update branding." };
  }

  const parsed = schema.safeParse({
    brand_logo_url: formData.get("brand_logo_url") ?? undefined,
    brand_primary_color: formData.get("brand_primary_color") ?? undefined,
    brand_product_name: formData.get("brand_product_name") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid branding values." };
  }

  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      brand_logo_url: parsed.data.brand_logo_url || null,
      brand_primary_color: parsed.data.brand_primary_color || null,
      brand_product_name: parsed.data.brand_product_name || null,
    })
    .eq("id", workspace.id);
  if (error) return { error: error.message };

  if (formData.get("advance") === "true") {
    await supabase.rpc("mark_onboarding_step", { p_workspace_id: workspace.id, p_step: "campaign" });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
