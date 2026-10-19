"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current-profile";
import { createServiceClient } from "@/lib/supabase/service";
import { getZoomCredentials } from "@/lib/zoom/credentials";
import { clearZoomTokenCache, verifyZoomCredentials, ZoomError } from "@/lib/zoom/client";

export interface ZoomSettingsState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const schema = z.object({
  account_id: z.string().trim().min(5, "Account ID is required").max(100),
  client_id: z.string().trim().min(5, "Client ID is required").max(100),
  client_secret: z.string().trim().min(8, "Client Secret is required").max(200),
});

async function verifyAndStore(workspaceId: string): Promise<ZoomSettingsState> {
  const admin = createServiceClient();
  const creds = await getZoomCredentials(workspaceId, { requireConnected: false });
  if (!creds) return { error: "No Zoom credentials saved." };
  clearZoomTokenCache(workspaceId);
  try {
    const me = await verifyZoomCredentials(creds);
    await admin
      .from("zoom_credentials")
      .update({ status: "connected", verified_at: new Date().toISOString(), last_error: null })
      .eq("workspace_id", workspaceId);
    return { ok: true, message: me.email ? `Connected (app owner ${me.email}).` : "Connected." };
  } catch (e) {
    const msg = e instanceof ZoomError ? e.message : "Verification failed.";
    await admin.from("zoom_credentials").update({ status: "error", verified_at: null, last_error: msg }).eq("workspace_id", workspaceId);
    return { error: msg };
  }
}

export async function saveZoomCredentials(_prev: ZoomSettingsState, formData: FormData): Promise<ZoomSettingsState> {
  const profile = await requireRole(["super_admin", "ops_manager"]);
  const parsed = schema.safeParse({
    account_id: formData.get("account_id"),
    client_id: formData.get("client_id"),
    client_secret: formData.get("client_secret"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const admin = createServiceClient();
  const { error } = await admin.rpc("set_zoom_credentials", {
    p_workspace_id: profile.workspace_id,
    p_account_id: parsed.data.account_id,
    p_client_id: parsed.data.client_id,
    p_client_secret: parsed.data.client_secret,
  });
  if (error) return { error: "Could not save the credentials." };

  const result = await verifyAndStore(profile.workspace_id);
  revalidatePath("/admin/settings/zoom");
  revalidatePath("/admin/integrations");
  return result;
}

export async function reverifyZoom(): Promise<ZoomSettingsState> {
  const profile = await requireRole(["super_admin", "ops_manager"]);
  const result = await verifyAndStore(profile.workspace_id);
  revalidatePath("/admin/settings/zoom");
  revalidatePath("/admin/integrations");
  return result;
}

export async function disconnectZoom(): Promise<ZoomSettingsState> {
  const profile = await requireRole(["super_admin", "ops_manager"]);
  const admin = createServiceClient();
  const { error } = await admin.rpc("clear_zoom_credentials", { p_workspace_id: profile.workspace_id });
  if (error) return { error: "Could not disconnect." };
  clearZoomTokenCache(profile.workspace_id);
  revalidatePath("/admin/settings/zoom");
  revalidatePath("/admin/integrations");
  return { ok: true, message: "Zoom disconnected." };
}
