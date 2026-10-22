import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { LeadsTable, type LeadRow } from "./leads-table";
import { ContactsTable, type ContactRow } from "./contacts-table";
import { LeadsFilters } from "./leads-filters";

export const metadata: Metadata = { title: "Leads", robots: { index: false, follow: false } };

// Everything that has been uploaded, in one place, with every column the file
// carried (mapped fields and the extra information), so the super admin can
// see the data as it is and hand any of it to an agent. Filters narrow by
// upload batch, campaign, owner and screening state.

const LIMIT = 500;
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const SCREENING = ["pending", "passed", "failed", "expired"];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const profile = await requireRole(["super_admin", "ops_manager"]);
  const sp = await searchParams;
  const batch = isUuid(one(sp.batch)) ? one(sp.batch) : "";
  const campaign = one(sp.campaign) === "none" || isUuid(one(sp.campaign)) ? one(sp.campaign) : "";
  const agent = one(sp.agent) === "unassigned" || isUuid(one(sp.agent)) ? one(sp.agent) : "";
  const screening = SCREENING.includes(one(sp.screening)) ? one(sp.screening) : "";
  const kind = one(sp.kind) === "contact" ? "contact" : "lead";
  const q = one(sp.q).trim().replace(/[,()%*\\]/g, " ").slice(0, 60).trim();

  const supabase = await createRealClient();
  const ws = profile.workspace_id;

  let leadQuery = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (batch) leadQuery = leadQuery.eq("batch_id", batch);
  if (campaign === "none") leadQuery = leadQuery.is("campaign_id", null);
  else if (campaign) leadQuery = leadQuery.eq("campaign_id", campaign);
  if (agent === "unassigned") leadQuery = leadQuery.is("assigned_to", null);
  else if (agent) leadQuery = leadQuery.eq("assigned_to", agent);
  if (screening) leadQuery = leadQuery.eq("screening_status", screening);
  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = [`full_name.ilike.%${q}%`, `company_name.ilike.%${q}%`, `email.ilike.%${q}%`, `contact_name.ilike.%${q}%`];
    if (digits.length >= 4) parts.push(`phone_e164.ilike.%${digits}%`);
    leadQuery = leadQuery.or(parts.join(","));
  }

  let contactQuery = supabase
    .from("unphoned_contacts")
    .select("id, full_name, email, company_name, city, campaign_id, data_source_id, assigned_to, custom, created_at", { count: "exact" })
    .eq("workspace_id", ws)
    .is("promoted_lead_id", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (campaign === "none") contactQuery = contactQuery.is("campaign_id", null);
  else if (campaign) contactQuery = contactQuery.eq("campaign_id", campaign);
  if (agent === "unassigned") contactQuery = contactQuery.is("assigned_to", null);
  else if (agent) contactQuery = contactQuery.eq("assigned_to", agent);
  if (q) contactQuery = contactQuery.or([`full_name.ilike.%${q}%`, `company_name.ilike.%${q}%`, `email.ilike.%${q}%`].join(","));

  const [
    { data: leads, count: leadCount, error: leadErr },
    { data: contacts, count: contactCount },
    { data: campaigns },
    { data: batches },
    { data: people },
    { count: contactTotal },
    { count: leadTotal },
  ] = await Promise.all([
    kind === "lead" ? leadQuery : Promise.resolve({ data: [] as LeadRow[], count: 0, error: null }),
    kind === "contact" ? contactQuery : Promise.resolve({ data: [] as ContactRow[], count: 0 }),
    supabase.from("campaigns").select("id, name, status").eq("workspace_id", ws).order("name"),
    supabase.from("lead_batches").select("id, source, row_count, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100),
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("workspace_id", ws)
      .in("role", ["agent", "team_lead", "ops_manager", "super_admin"])
      .order("full_name"),
    supabase.from("unphoned_contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws).is("promoted_lead_id", null),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
  ]);

  const agents = (people ?? []).filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.full_name, role: p.role }));
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const batchName = new Map((batches ?? []).map((b) => [b.id, b.source ?? "Batch"]));

  const filters = { batch, campaign, agent, screening, kind, q };

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Leads</h1>
          <p className="text-xs text-muted">
            {leadTotal ?? 0} lead{leadTotal === 1 ? "" : "s"} and {contactTotal ?? 0} contact{contactTotal === 1 ? "" : "s"} without a number in your
            workspace. Every column from your files is shown here. Tick rows to assign them to an agent, screen them, or move them into a campaign.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/import"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-blue px-4 text-sm font-medium text-white hover:brightness-110"
          >
            Upload leads
          </Link>
        </div>
      </div>

      <LeadsFilters
        filters={filters}
        campaigns={(campaigns ?? []).map((c) => ({ id: c.id, name: c.name }))}
        batches={(batches ?? []).map((b) => ({ id: b.id, name: b.source ?? "Batch", rows: b.row_count }))}
        agents={agents}
        leadTotal={leadTotal ?? 0}
        contactTotal={contactTotal ?? 0}
      />

      {leadErr && (
        <p role="alert" className="mb-3 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">
          {leadErr.message}
        </p>
      )}

      {kind === "lead" ? (
        <LeadsTable
          rows={(leads ?? []) as LeadRow[]}
          total={leadCount ?? 0}
          limit={LIMIT}
          agents={agents}
          campaigns={(campaigns ?? []).map((c) => ({ id: c.id, name: c.name }))}
          nameById={Object.fromEntries(nameById)}
          campaignName={Object.fromEntries(campaignName)}
          batchName={Object.fromEntries(batchName)}
          timezone={profile.timezone}
        />
      ) : (
        <ContactsTable
          rows={(contacts ?? []) as ContactRow[]}
          total={contactCount ?? 0}
          limit={LIMIT}
          agents={agents}
          nameById={Object.fromEntries(nameById)}
          campaignName={Object.fromEntries(campaignName)}
          timezone={profile.timezone}
        />
      )}

      <p className="mt-3 text-[11px] text-muted">
        Assigning a row to an agent also puts them on that campaign&apos;s roster, so it appears on their call sheet straight away. A lead
        is dialable once it has passed screening and its campaign is live; contacts without a number become leads when the agent adds one.
      </p>
    </div>
  );
}
