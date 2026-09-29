"use server";

import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import type { RealTables } from "@/lib/supabase/real-types";

export interface LiveFloorData {
  statuses: {
    user_id: string;
    full_name: string;
    role: string;
    status: string;
    call_started_at: string | null;
  }[];
  stats: { calls_today: number; connects_today: number; conversions_today: number };
  pendingLeave: RealTables<"leave_requests">[];
}

export async function getLiveFloorData(): Promise<LiveFloorData> {
  const profile = await requireRealProfile();
  const supabase = await createRealClient();

  const [{ data: statuses }, { data: stats }, leaveResult] = await Promise.all([
    supabase.rpc("workspace_live_status"),
    supabase.rpc("workspace_today_stats"),
    profile.role === "super_admin" || profile.role === "ops_manager"
      ? supabase.from("leave_requests").select("*").eq("workspace_id", profile.workspace_id).eq("status", "pending").order("created_at")
      : Promise.resolve({ data: [] as RealTables<"leave_requests">[] }),
  ]);

  return {
    statuses: statuses ?? [],
    stats: stats?.[0] ?? { calls_today: 0, connects_today: 0, conversions_today: 0 },
    pendingLeave: leaveResult.data ?? [],
  };
}
