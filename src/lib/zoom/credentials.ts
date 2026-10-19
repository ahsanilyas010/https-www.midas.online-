import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

export interface ZoomCredentials {
  workspaceId: string;
  accountId: string;
  clientId: string;
  clientSecret: string;
}

// The only place outside the SQL functions that ever sees the decrypted
// client secret. Never log the return value.
export async function getZoomCredentials(workspaceId: string, opts: { requireConnected?: boolean } = {}): Promise<ZoomCredentials | null> {
  const admin = createServiceClient();
  const { data: row } = await admin
    .from("zoom_credentials")
    .select("account_id, client_id, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!row) return null;
  if ((opts.requireConnected ?? true) && row.status !== "connected") return null;

  const { data: secret, error } = await admin.rpc("get_zoom_client_secret", { p_workspace_id: workspaceId });
  if (error || !secret) return null;
  return { workspaceId, accountId: row.account_id, clientId: row.client_id, clientSecret: secret };
}
