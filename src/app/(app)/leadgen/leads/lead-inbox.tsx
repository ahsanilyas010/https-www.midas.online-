"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Shuffle, UserCheck } from "lucide-react";
import {
  assignLeadsToAgent,
  autoAssignLeads,
  listAssignableAgents,
  type AssignableAgent,
} from "@/lib/actions/lead-gen";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadStatusBadge, ScreeningBadge, fmtDateTime } from "../ui";
import { TableWrap } from "@/components/ui/data-table";

export interface InboxRow {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  campaignId: string | null;
  campaign: string | null;
  status: string;
  screening: string;
  agent: string | null;
  createdAt: string;
}

export function LeadInbox({ rows, campaigns }: { rows: InboxRow[]; campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [campaignId, setCampaignId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [agents, setAgents] = useState<AssignableAgent[]>([]);
  const [pending, startTransition] = useTransition();

  // Default the hand-off campaign to the campaign of the selected leads.
  useEffect(() => {
    const picked = rows.filter((r) => selected.has(r.id) && r.campaignId);
    const ids = [...new Set(picked.map((r) => r.campaignId as string))];
    if (ids.length === 1) setCampaignId(ids[0]);
  }, [selected, rows]);

  useEffect(() => {
    let live = true;
    setAgentId("");
    if (!campaignId) {
      setAgents([]);
      return;
    }
    listAssignableAgents(campaignId).then((a) => live && setAgents(a));
    return () => {
      live = false;
    };
  }, [campaignId]);

  const rostered = agents.filter((a) => a.onRoster);
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const ids = [...selected];

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function done(result: { error?: string; assigned?: number; skipped?: number }, verb: string) {
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${verb} ${result.assigned} lead(s)${result.skipped ? `, ${result.skipped} skipped` : ""}.`);
    setSelected(new Set());
    router.refresh();
  }

  function assign() {
    startTransition(async () => done(await assignLeadsToAgent(ids, campaignId, agentId), "Assigned"));
  }
  function auto() {
    startTransition(async () => done(await autoAssignLeads(campaignId, ids), "Round-robin assigned"));
  }

  return (
    <div className="space-y-2">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue-tint p-2">
          <span className="px-1 text-sm font-medium text-ink">{selected.size} selected</span>
          <div className="w-52">
            <Select value={campaignId || undefined} onValueChange={setCampaignId}>
              <SelectTrigger aria-label="Campaign">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <Select value={agentId || undefined} onValueChange={setAgentId} disabled={!campaignId}>
              <SelectTrigger aria-label="Sales agent">
                <SelectValue placeholder={campaignId && rostered.length === 0 ? "No agents on roster" : "Sales agent"} />
              </SelectTrigger>
              <SelectContent>
                {rostered.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.openLeads} open)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={assign} disabled={pending || !campaignId || !agentId}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Assign
          </Button>
          <Button size="sm" variant="secondary" onClick={auto} disabled={pending || !campaignId || rostered.length === 0}>
            <Shuffle className="h-3.5 w-3.5" /> Round-robin
          </Button>
          <button type="button" className="ml-auto text-xs text-muted hover:underline" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          <p className="w-full px-1 text-[11px] text-muted">
            Agents must be on the campaign&rsquo;s roster. Pending leads reach the agent but cannot be dialled until a
            manager screens them. Suppressed numbers are never handed out.
          </p>
        </div>
      )}

      <TableWrap label="Lead inbox">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className="w-8 px-3 py-2">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={allOnPage}
                  onCheckedChange={(c) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Campaign</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Screening</th>
              <th className="px-3 py-2 font-medium">Assigned to</th>
              <th className="px-3 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="h-[42px] border-b border-line last:border-0">
                <td className="px-3 py-1.5">
                  <Checkbox aria-label="Select lead" checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                </td>
                <td className="px-3 py-1.5">
                  <div className="font-medium text-ink">{r.name ?? r.company ?? "Unnamed"}</div>
                  <div className="tabular text-[11px] text-muted">
                    {[r.company && r.name ? r.company : null, r.phone, r.email].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted">{r.source ?? "—"}</td>
                <td className="px-3 py-1.5 text-xs text-muted">{r.campaign ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <LeadStatusBadge status={r.status} />
                </td>
                <td className="px-3 py-1.5">
                  <ScreeningBadge status={r.screening} />
                </td>
                <td className="px-3 py-1.5 text-xs text-muted">{r.agent ?? "Unassigned"}</td>
                <td className="px-3 py-1.5 tabular text-xs text-muted">{fmtDateTime(r.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted">
                  No leads here yet. To bring some in, use Import leads (a CSV or Excel file: you match its columns to name, phone, company and email), add one by hand, or connect a form under Connectors.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}
