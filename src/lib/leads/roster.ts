import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";

// An agent only receives their assigned leads (dial queue, call sheet, RLS)
// when they are on the lead's campaign roster. Assigning a lead therefore puts
// the agent on that roster too, so "assign to agent" means the agent actually
// gets the data rather than silently waiting on a roster change. Returns how
// many rosters the user was added to.
export async function ensureOnRosters(
  supabase: SupabaseClient<RealDatabase>,
  workspaceId: string,
  userId: string,
  campaignIds: (string | null | undefined)[],
): Promise<number> {
  const ids = [...new Set(campaignIds.filter((c): c is string => Boolean(c)))];
  if (ids.length === 0) return 0;
  const { data: existing } = await supabase
    .from("campaign_assignments")
    .select("campaign_id")
    .eq("user_id", userId)
    .in("campaign_id", ids);
  const have = new Set((existing ?? []).map((e) => e.campaign_id));
  const missing = ids.filter((c) => !have.has(c));
  if (missing.length === 0) return 0;
  const { error } = await supabase
    .from("campaign_assignments")
    .upsert(
      missing.map((campaign_id) => ({ workspace_id: workspaceId, campaign_id, user_id: userId })),
      { onConflict: "campaign_id,user_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`Couldn't put the agent on the campaign roster: ${error.message}`);
  return missing.length;
}
