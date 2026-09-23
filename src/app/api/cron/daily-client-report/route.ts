import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider } from "@/lib/email/provider";
import { renderDailyClientReportEmail } from "@/lib/reports/daily-agent-email";
import { captureException } from "@/lib/error-tracking";
import { BRAND } from "@/lib/brand";

// Fired daily by Vercel Cron (see vercel.json). No user session exists for
// a cron invocation, so this goes through the service-role client and
// queries the source tables directly rather than the client_viewer-gated
// get_client_agent_activity RPC (which requires an authenticated
// client_viewer/manager and would reject a service-role caller the same
// way it rejects an unauthenticated one — see migration 31's comment).
// The CRON_SECRET check below is what stands in for that auth instead.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const day = new Date().toISOString().slice(0, 10);
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const [{ data: clients }, { data: dispositions }] = await Promise.all([
    supabase.from("clients").select("id, name, contact_email").eq("is_active", true).not("contact_email", "is", null),
    supabase.from("dispositions").select("id, category"),
  ]);
  const categoryById = new Map((dispositions ?? []).map((d) => [d.id, d.category]));

  const results: { client: string; sent: boolean; reason?: string }[] = [];

  for (const client of clients ?? []) {
    try {
      const { data: campaigns } = await supabase.from("campaigns").select("id").eq("client_id", client.id);
      const campaignIds = (campaigns ?? []).map((c) => c.id);
      if (campaignIds.length === 0) {
        results.push({ client: client.name, sent: false, reason: "no campaigns" });
        continue;
      }

      const { data: assignments } = await supabase
        .from("campaign_assignments")
        .select("user_id")
        .in("campaign_id", campaignIds);
      const agentIds = Array.from(new Set((assignments ?? []).map((a) => a.user_id)));
      if (agentIds.length === 0) {
        results.push({ client: client.name, sent: false, reason: "no agents assigned" });
        continue;
      }

      const [{ data: calls }, { data: attendance }] = await Promise.all([
        supabase
          .from("call_attempts")
          .select("agent_id, talk_seconds, wrap_seconds, disposition_id")
          .in("campaign_id", campaignIds)
          .gte("started_at", dayStart)
          .lt("started_at", dayEnd),
        supabase
          .from("attendance_sessions")
          .select("worked_minutes, productive_minutes")
          .in("user_id", agentIds)
          .eq("work_date", day),
      ]);

      const callRows = calls ?? [];
      const stats = {
        clientName: client.name,
        day,
        agentsActive: new Set(callRows.map((c) => c.agent_id)).size,
        callsAttempted: callRows.length,
        connects: callRows.filter((c) => {
          const category = c.disposition_id ? categoryById.get(c.disposition_id) : null;
          return typeof category === "string" && category.startsWith("connected");
        }).length,
        talkMinutes: callRows.reduce((sum, c) => sum + (c.talk_seconds ?? 0), 0) / 60,
        wrapMinutes: callRows.reduce((sum, c) => sum + (c.wrap_seconds ?? 0), 0) / 60,
        attendanceMinutes: (attendance ?? []).reduce((sum, a) => sum + a.worked_minutes, 0),
        productiveMinutes: (attendance ?? []).reduce((sum, a) => sum + a.productive_minutes, 0),
      };

      const { subject, html, text } = renderDailyClientReportEmail(stats);
      const provider = getEmailProvider();
      const sendResult = await provider.send({
        to: client.contact_email!,
        from: `${process.env.EMAIL_DEFAULT_FROM_NAME ?? BRAND.emailFromName} <hello@${process.env.EMAIL_FROM_DOMAIN ?? BRAND.emailFromDomainFallback}>`,
        subject,
        html,
        text,
      });

      results.push({
        client: client.name,
        sent: sendResult.ok,
        reason: sendResult.ok ? undefined : sendResult.error,
      });
    } catch (err) {
      captureException(err, { route: "/api/cron/daily-client-report", clientId: client.id });
      results.push({ client: client.name, sent: false, reason: "internal error" });
    }
  }

  return NextResponse.json({ day, results });
}
