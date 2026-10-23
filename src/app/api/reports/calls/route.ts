import { NextResponse } from "next/server";
import { requireRealProfile } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { callsToCsv, loadCallReport, parseRange } from "@/lib/reports/call-report";

// CSV of calls. An agent always gets their own; a manager or team lead can
// pass ?agent=<id> for one agent, or leave it off for everyone they can see
// (row-level security decides what that is).
export async function GET(request: Request) {
  const profile = await requireRealProfile();
  if (!["agent", "team_lead", "ops_manager", "super_admin"].includes(profile.role)) {
    return new NextResponse("Not allowed", { status: 403 });
  }
  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));
  const wanted = url.searchParams.get("agent");
  const agentId = profile.role === "agent" ? profile.id : wanted && /^[0-9a-f-]{36}$/i.test(wanted) ? wanted : undefined;

  const supabase = await createRealClient();
  const report = await loadCallReport(supabase, { workspaceId: profile.workspace_id, range, agentId });

  const ids = [...new Set(report.rows.map((r) => r.agentId))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of data ?? []) names.set(p.id, p.full_name);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(callsToCsv(report.rows, names), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="calls-${range}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
