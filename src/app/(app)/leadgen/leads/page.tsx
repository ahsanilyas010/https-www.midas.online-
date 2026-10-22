import Link from "next/link";
import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { LEADGEN_ROLES } from "../ui";
import { LeadImporterDialog } from "@/components/leads/lead-importer";
import { RegisterSourceDialog } from "../../admin/data/register-source-dialog";
import { AddLeadDialog } from "./add-lead-dialog";
import { LeadInbox, type InboxRow } from "./lead-inbox";

const PAGE_SIZE = 25;

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SCREENING = ["pending", "passed", "failed", "expired"];

export default async function LeadInboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const profile = await requireRole([...LEADGEN_ROLES]);
  const sp = await searchParams;
  const q = one(sp.q).trim().replace(/[,()%*\\]/g, " ").slice(0, 60).trim();
  const campaign = one(sp.campaign);
  const screening = SCREENING.includes(one(sp.screening)) ? one(sp.screening) : "";
  const owner = ["unassigned", "assigned"].includes(one(sp.owner)) ? one(sp.owner) : "";
  const source = one(sp.source);
  const page = Math.max(1, parseInt(one(sp.page), 10) || 1);

  const supabase = await createRealClient();
  const ws = profile.workspace_id;

  let query = supabase
    .from("leads")
    .select(
      "id, first_name, last_name, full_name, company_name, email, phone_e164, source, status, screening_status, assigned_to, campaign_id, data_source_id, created_at",
      { count: "exact" },
    )
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = [`full_name.ilike.%${q}%`, `company_name.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (digits.length >= 4) parts.push(`phone_e164.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }
  if (/^[0-9a-f-]{36}$/i.test(campaign)) query = query.eq("campaign_id", campaign);
  if (screening) query = query.eq("screening_status", screening);
  if (owner === "unassigned") query = query.is("assigned_to", null);
  if (owner === "assigned") query = query.not("assigned_to", "is", null);
  if (source.startsWith("ds:") && /^[0-9a-f-]{36}$/i.test(source.slice(3))) query = query.eq("data_source_id", source.slice(3));
  else if (source.startsWith("src:")) query = query.eq("source", source.slice(4).slice(0, 40));

  const [{ data: leads, count }, { data: campaigns }, { data: agents }, { data: sources }, { data: tags }] =
    await Promise.all([
      query,
      supabase.rpc("leadgen_campaigns"),
      supabase.rpc("leadgen_assignable_agents"),
      supabase.from("data_sources").select("id, name, is_active").eq("workspace_id", ws).order("name"),
      supabase.from("leads").select("source").eq("workspace_id", ws).not("source", "is", null).limit(1000),
    ]);

  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const agentName = new Map((agents ?? []).map((a) => [a.id, a.full_name ?? "Agent"]));
  const sourceName = new Map((sources ?? []).map((s) => [s.id, s.name]));
  const tagOptions = [...new Set((tags ?? []).map((t) => t.source as string))].sort();

  const rows: InboxRow[] = (leads ?? []).map((l) => ({
    id: l.id,
    name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
    company: l.company_name,
    email: l.email,
    phone: l.phone_e164,
    source: l.source ?? (l.data_source_id ? sourceName.get(l.data_source_id) ?? null : null),
    campaignId: l.campaign_id,
    campaign: l.campaign_id ? campaignName.get(l.campaign_id) ?? null : null,
    status: l.status,
    screening: l.screening_status,
    agent: l.assigned_to ? agentName.get(l.assigned_to) ?? "Agent" : null,
    createdAt: l.created_at,
  }));

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (campaign) params.set("campaign", campaign);
    if (screening) params.set("screening", screening);
    if (owner) params.set("owner", owner);
    if (source) params.set("source", source);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/leadgen/leads${s ? `?${s}` : ""}`;
  };

  const selectCls =
    "h-9 rounded-md border border-line bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue";
  const activeSources = (sources ?? []).filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg font-semibold text-ink">Lead inbox</h1>
          <p className="text-xs text-muted">
            Leads you sourced, handed off, or that nobody owns yet. {total} match{total === 1 ? "" : "es"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LeadImporterDialog
            label="Import leads"
            isManager={profile.role !== "lead_gen"}
            campaigns={(campaigns ?? []).map((c) => ({ id: c.id, name: c.name, country: c.country }))}
            dataSources={activeSources}
          />
          <RegisterSourceDialog />
          <AddLeadDialog campaigns={(campaigns ?? []).map((c) => ({ id: c.id, name: c.name, country: c.country }))} dataSources={activeSources} />
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, company, email, phone"
          className="h-9 min-w-[220px] flex-1 rounded-md border border-line bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
        <select name="campaign" defaultValue={campaign} className={selectCls} aria-label="Campaign">
          <option value="">All campaigns</option>
          {(campaigns ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="screening" defaultValue={screening} className={selectCls} aria-label="Screening">
          <option value="">Any screening</option>
          {SCREENING.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select name="owner" defaultValue={owner} className={selectCls} aria-label="Assignment">
          <option value="">Any owner</option>
          <option value="unassigned">Unassigned</option>
          <option value="assigned">Assigned</option>
        </select>
        <select name="source" defaultValue={source} className={selectCls} aria-label="Source">
          <option value="">All sources</option>
          {tagOptions.map((t) => (
            <option key={t} value={`src:${t}`}>
              Tag: {t}
            </option>
          ))}
          {(sources ?? []).map((s) => (
            <option key={s.id} value={`ds:${s.id}`}>
              Source: {s.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg bg-brand-blue px-4 text-sm font-medium text-white shadow-sm hover:brightness-110"
        >
          Filter
        </button>
        {(q || campaign || screening || owner || source) && (
          <Link href="/leadgen/leads" className="text-xs font-medium text-brand-blue hover:underline">
            Clear
          </Link>
        )}
      </form>

      <LeadInbox rows={rows} campaigns={(campaigns ?? []).map((c) => ({ id: c.id, name: c.name }))} />

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          Page {page} of {pages}
        </span>
        <div className="flex gap-3">
          {page > 1 && (
            <Link href={link(page - 1)} className="font-medium text-brand-blue hover:underline">
              Previous
            </Link>
          )}
          {page < pages && (
            <Link href={link(page + 1)} className="font-medium text-brand-blue hover:underline">
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
