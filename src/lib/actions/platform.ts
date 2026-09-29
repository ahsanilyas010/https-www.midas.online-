"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import type { RealEnums } from "@/lib/supabase/real-types";

export async function setWorkspaceStatus(workspaceId: string, status: RealEnums<"workspace_status">): Promise<{ error?: string }> {
  await requirePlatformAdmin();
  const supabase = await createRealClient();
  const { error } = await supabase.rpc("platform_set_workspace_status", { p_workspace_id: workspaceId, p_status: status });
  if (error) return { error: error.message };
  revalidatePath("/platform", "page");
  return {};
}
