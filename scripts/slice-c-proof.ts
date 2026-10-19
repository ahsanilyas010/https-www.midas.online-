// Proof for slice C (attendance admin, compliance, data sourcing) against the
// live DB, as real signed-in demo personas. Cleans up the rows it creates.
// Run: npx tsx --conditions=react-server scripts/slice-c-proof.ts
import { config } from "dotenv";
config({ path: ".env.local" });
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RealDatabase } from "@/lib/supabase/real-types";
import { DEMO_PASSWORD } from "@/lib/seed/personas";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createClient<RealDatabase>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);

let failures = 0;
const ok = (l: string) => console.log(`  ok    ${l}`);
const bad = (l: string, d?: unknown) => {
  console.error(`  FAIL  ${l}${d ? ` - ${JSON.stringify(d)}` : ""}`);
  failures++;
};
const check = (c: boolean, l: string, d?: unknown) => (c ? ok(l) : bad(l, d));

async function as(email: string) {
  const c: SupabaseClient<RealDatabase> = createClient<RealDatabase>(url, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error || !data.user) throw new Error(`sign-in ${email}: ${error?.message}`);
  const { data: p } = await c.from("profiles").select("*").eq("id", data.user.id).single();
  return { c, profile: p! };
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

async function main() {
  const ops = await as("ops@leadcallient.demo");
  const agent = await as("agent@leadcallient.demo").catch(() => null);
  const ws = ops.profile.workspace_id;
  const tag = `proof-${Date.now()}`;
  const cleanup: (() => Promise<unknown>)[] = [];

  try {
    console.log("attendance");
    const { data: shift, error: se } = await ops.c
      .from("shifts")
      .insert({ workspace_id: ws, name: tag, start_time: "09:00", end_time: "17:00", timezone: "Asia/Karachi", grace_minutes: 5, days_of_week: [1, 2, 3, 4, 5] })
      .select("*")
      .single();
    check(!se && !!shift && shift.timezone === "Asia/Karachi", "manager creates shift with tz/grace", se?.message);
    if (shift) cleanup.push(async () => svc.from("shifts").delete().eq("id", shift.id));
    if (agent) {
      const { error: ae } = await agent.c.from("shifts").insert({ workspace_id: ws, name: tag + "x", start_time: "09:00", end_time: "17:00" });
      check(!!ae, "agent cannot create a shift", ae?.message);
      const { data: asg, error: ge } = await ops.c
        .from("shift_assignments")
        .upsert({ workspace_id: ws, shift_id: shift!.id, user_id: agent.profile.id }, { onConflict: "workspace_id,user_id,shift_id" })
        .select("id");
      check(!ge && asg?.length === 1, "manager assigns shift", ge?.message);
      const { data: seen } = await agent.c.from("shift_assignments").select("id").eq("shift_id", shift!.id);
      check((seen ?? []).length === 1, "agent sees own assignment");

      const { data: lv, error: le } = await agent.c
        .from("leave_requests")
        .insert({ workspace_id: ws, user_id: agent.profile.id, from_date: "2030-01-01", to_date: "2030-01-02", reason: tag })
        .select("id")
        .single();
      check(!le && !!lv, "agent files leave", le?.message);
      if (lv) cleanup.push(async () => svc.from("leave_requests").delete().eq("id", lv.id));
      const { data: self } = await agent.c.from("leave_requests").update({ status: "approved" }).eq("id", lv!.id).select("id");
      check((self ?? []).length === 0, "agent cannot approve own leave");
      const { data: dec } = await ops.c
        .from("leave_requests")
        .update({ status: "approved", approved_by: ops.profile.id, approved_at: new Date().toISOString() })
        .eq("id", lv!.id)
        .eq("status", "pending")
        .select("status");
      check(dec?.[0]?.status === "approved", "manager approves leave");

      const { error: ee } = await agent.c.from("attendance_events").insert({ workspace_id: ws, user_id: agent.profile.id, event_type: "clock_in" });
      check(!ee, "agent clocks in", ee?.message);
      cleanup.push(async () => svc.from("attendance_events").delete().eq("user_id", agent.profile.id).gte("occurred_at", new Date(Date.now() - 600000).toISOString()));
      const { data: evs } = await ops.c.from("attendance_events").select("id").eq("user_id", agent.profile.id).limit(1);
      check((evs ?? []).length > 0, "manager reads agent attendance events");
      const { data: roster, error: re } = await ops.c.from("campaign_assignments").select("campaign_id,user_id").eq("workspace_id", ws);
      check(!re && Array.isArray(roster), "manager reads campaign roster", re?.message);
    }

    console.log("compliance");
    const phone = `+4477009${Math.floor(10000 + Math.random() * 89999)}`;
    const { data: sup, error: sie } = await ops.c
      .from("suppression_list")
      .insert({ workspace_id: ws, phone_hash: hash(phone), reason: "internal_optout", added_by: ops.profile.id, phone_hint: "+44••••", note: tag })
      .select("id")
      .single();
    check(!sie && !!sup, "manager adds suppression", sie?.message);
    if (sup) cleanup.push(async () => svc.from("suppression_list").delete().eq("id", sup.id));
    if (agent && sup) {
      const { data: del } = await agent.c.from("suppression_list").delete().eq("id", sup.id).select("id");
      check((del ?? []).length === 0, "agent cannot remove suppression");
    }
    const { data: stats } = await ops.c.from("v_compliance_stats").select("*").eq("workspace_id", ws).maybeSingle();
    check(!!stats && (stats.suppression_total ?? 0) >= 1, "v_compliance_stats readable", stats);

    console.log("data sourcing");
    if (agent) {
      const { error: ade } = await agent.c.from("data_sources").insert({ workspace_id: ws, name: tag + "a", source_type: "referral", lawful_basis: "consent" });
      check(!!ade, "agent cannot register a data source");
    }
    const { data: ds, error: dse } = await ops.c
      .from("data_sources")
      .insert({ workspace_id: ws, name: tag, source_type: "vendor_licensed", lawful_basis: "legitimate_interest", created_by: ops.profile.id })
      .select("*")
      .single();
    check(!dse && !!ds, "manager registers data source", dse?.message);
    if (!ds) throw new Error("no data source");
    cleanup.push(async () => svc.from("data_sources").delete().eq("id", ds.id));

    const { data: run } = await ops.c.from("source_fetch_runs").insert({ workspace_id: ws, data_source_id: ds.id, records_found: 3 }).select("id").single();
    check(!!run, "import run recorded");
    const { data: batch } = await ops.c
      .from("lead_batches")
      .insert({ workspace_id: ws, data_source_id: ds.id, source: tag, row_count: 2, status: "uploaded" })
      .select("id")
      .single();
    check(!!batch, "batch tagged with source");
    cleanup.push(async () => svc.from("lead_batches").delete().eq("id", batch!.id));
    cleanup.push(async () => svc.from("leads").delete().eq("data_source_id", ds.id));
    const leadPhones = [`+4477008${Math.floor(10000 + Math.random() * 89999)}`, `+4477008${Math.floor(10000 + Math.random() * 89999)}`];
    const { error: le2 } = await ops.c
      .from("leads")
      .insert(leadPhones.map((p) => ({ workspace_id: ws, batch_id: batch!.id, data_source_id: ds.id, phone_e164: p, full_name: tag })));
    check(!le2, "leads inserted with provenance", le2?.message);
    const { data: perf } = await ops.c.from("v_source_performance").select("*").eq("data_source_id", ds.id).single();
    check(perf?.leads_loaded === 2, "v_source_performance counts the source's leads", perf);

    const { data: sc, error: sce } = await ops.c.rpc("screen_lead_batch", { p_batch_id: batch!.id, p_evidence_url: null as unknown as string });
    check(!sce && sc === 2, "screen_lead_batch stamps pending leads", sce?.message ?? sc);

    // Unphoned contact -> promote
    const { data: uc, error: uce } = await ops.c
      .from("unphoned_contacts")
      .insert({ workspace_id: ws, data_source_id: ds.id, run_id: run!.id, full_name: tag, email: "x@example.com", country_hint: "GB" })
      .select("id")
      .single();
    check(!uce && !!uc, "phone-less contact stored", uce?.message);
    cleanup.push(async () => svc.from("unphoned_contacts").delete().eq("id", uc!.id));
    if (agent) {
      const { error: pe } = await agent.c.rpc("promote_unphoned_contact", { p_contact_id: uc!.id, p_phone_e164: "+447700900555", p_phone_raw: "x" });
      check(!!pe, "unassigned agent cannot promote", pe?.message);
      const { data: seeU } = await agent.c.from("unphoned_contacts").select("id").eq("id", uc!.id);
      check((seeU ?? []).length === 0, "agent cannot see unassigned contact");
    }
    const { error: spe } = await ops.c.rpc("promote_unphoned_contact", { p_contact_id: uc!.id, p_phone_e164: phone, p_phone_raw: phone });
    check(!!spe && /suppression/.test(spe.message), "promote refuses a suppressed number", spe?.message);
    const newPhone = `+4477007${Math.floor(10000 + Math.random() * 89999)}`;
    const { data: lid, error: pe2 } = await ops.c.rpc("promote_unphoned_contact", { p_contact_id: uc!.id, p_phone_e164: newPhone, p_phone_raw: newPhone });
    check(!pe2 && !!lid, "manager promotes contact to a lead", pe2?.message);
    const { data: nl } = await ops.c.from("leads").select("screening_status,data_source_id").eq("id", lid as string).single();
    check(nl?.screening_status === "pending" && nl?.data_source_id === ds.id, "promoted lead is pending + carries provenance", nl);
    const { error: pe3 } = await ops.c.rpc("promote_unphoned_contact", { p_contact_id: uc!.id, p_phone_e164: newPhone, p_phone_raw: newPhone });
    check(!!pe3, "cannot promote twice");

    const { data: aud } = await svc.from("audit_log").select("id").eq("entity_type", "data_source").eq("entity_id", ds.id);
    check((aud ?? []).length >= 1, "data source insert audited");
  } finally {
    for (const f of cleanup.reverse()) await f().catch(() => undefined);
  }
  console.log(failures ? `\n${failures} FAILED` : "\nall passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
