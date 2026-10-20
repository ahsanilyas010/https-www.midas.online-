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

// Used by Settings -> Branding (admin/settings/branding).
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

  // A logo must be a file in THIS workspace's own folder of the branding
  // bucket, never an arbitrary URL typed or tampered into the form.
  const logoUrl = parsed.data.brand_logo_url || null;
  if (logoUrl) {
    const allowedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/workspace-branding/${workspace.id}/`;
    if (!logoUrl.startsWith(allowedPrefix)) return { error: "That logo isn't valid. Please upload it again." };
  }

  const supabase = await createRealClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      brand_logo_url: logoUrl,
      brand_primary_color: parsed.data.brand_primary_color || null,
      brand_product_name: parsed.data.brand_product_name || null,
    })
    .eq("id", workspace.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
