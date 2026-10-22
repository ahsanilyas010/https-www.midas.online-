"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { STICKY_FIRST, TableWrap } from "@/components/ui/data-table";
import { EMPTY, fmtDateTime } from "@/lib/format";
import { SCREENING_BADGE } from "@/lib/lead-status";
import type { RealTables } from "@/lib/supabase/real-types";
import { bulkAssignLeads, bulkMoveLeadsToCampaign, bulkScreenLeads } from "@/lib/actions/lead-admin";
import { BulkBar, customKeys, customValue, type BulkAgent } from "./bulk-bar";

export type LeadRow = RealTables<"leads">;

const cell = "max-w-[220px] truncate px-3 py-1.5";

export function LeadsTable({
  rows,
  total,
  limit,
  agents,
  campaigns,
  nameById,
  campaignName,
  batchName,
  timezone,
}: {
  rows: LeadRow[];
  total: number;
  limit: number;
  agents: BulkAgent[];
  campaigns: { id: string; name: string }[];
  nameById: Record<string, string>;
  campaignName: Record<string, string>;
  batchName: Record<string, string>;
  timezone: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const extraKeys = useMemo(() => customKeys(rows), [rows]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const ids = [...selected];

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const name = (l: LeadRow) => [l.first_name, l.last_name].filter(Boolean).join(" ") || l.full_name || "";

  return (
    <div>
      <BulkBar
        count={selected.size}
        agents={agents}
        campaigns={campaigns}
        noun="lead"
        onAssign={(u) => bulkAssignLeads(ids, u)}
        onScreen={() => bulkScreenLeads(ids)}
        onMove={(c) => bulkMoveLeadsToCampaign(ids, c)}
        onClear={() => setSelected(new Set())}
      />
      <TableWrap label="Uploaded leads">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className={`${STICKY_FIRST} w-8 bg-canvas px-3 py-2`}>
                <Checkbox aria-label="Select all leads shown" checked={allSelected} onCheckedChange={toggleAll} />
              </th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Contact person</th>
              <th className="px-3 py-2 font-medium">Campaign</th>
              <th className="px-3 py-2 font-medium">Assigned to</th>
              <th className="px-3 py-2 font-medium">Screening</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Website</th>
              <th className="px-3 py-2 font-medium">Next step</th>
              <th className="px-3 py-2 font-medium">Appointment</th>
              <th className="px-3 py-2 font-medium">Notes</th>
              {extraKeys.map((k) => (
                <th key={k} className="px-3 py-2 font-medium" title="Extra information from your file">
                  {k}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Upload</th>
              <th className="px-3 py-2 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const on = selected.has(l.id);
              return (
                <tr key={l.id} className={`h-[38px] border-b border-line bg-surface last:border-0 ${on ? "bg-brand-blue-tint/40" : ""}`} data-testid="lead-row">
                  <td className={`${STICKY_FIRST} px-3 py-1.5`}>
                    <Checkbox aria-label={`Select ${name(l) || l.phone_e164 || "lead"}`} checked={on} onCheckedChange={() => toggle(l.id)} />
                  </td>
                  <td className={`${cell} font-medium text-ink`} title={name(l)}>
                    {name(l) || EMPTY}
                  </td>
                  <td className="tabular px-3 py-1.5">{l.phone_e164 ?? EMPTY}</td>
                  <td className={`${cell} text-muted`} title={l.company_name ?? undefined}>
                    {l.company_name ?? EMPTY}
                  </td>
                  <td className={`${cell} text-muted`} title={l.email ?? undefined}>
                    {l.email ?? EMPTY}
                  </td>
                  <td className={`${cell} text-muted`}>{l.contact_name ?? EMPTY}</td>
                  <td className="px-3 py-1.5 text-muted">
                    {l.campaign_id ? (
                      <Link href={`/admin/campaigns/${l.campaign_id}`} className="hover:underline">
                        {campaignName[l.campaign_id] ?? EMPTY}
                      </Link>
                    ) : (
                      <Badge variant="warning">No campaign</Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted">
                    {l.assigned_to ? (nameById[l.assigned_to] ?? EMPTY) : <span className="text-warning">Unassigned</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant={SCREENING_BADGE[l.screening_status] ?? "neutral"}>{l.screening_status}</Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant="neutral">{l.status.replace(/_/g, " ")}</Badge>
                  </td>
                  <td className={`${cell} text-muted`} title={l.website ?? undefined}>
                    {l.website ?? EMPTY}
                  </td>
                  <td className={`${cell} text-muted`} title={l.next_step ?? undefined}>
                    {l.next_step ?? EMPTY}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted">
                    {l.appointment_at ? fmtDateTime(l.appointment_at, timezone) : EMPTY}
                  </td>
                  <td className={`${cell} text-muted`} title={l.agent_notes ?? undefined}>
                    {l.agent_notes ?? EMPTY}
                  </td>
                  {extraKeys.map((k) => {
                    const v = customValue(l.custom, k);
                    return (
                      <td key={k} className={`${cell} text-muted`} title={v || undefined}>
                        {v || EMPTY}
                      </td>
                    );
                  })}
                  <td className={`${cell} text-xs text-muted`} title={l.batch_id ? batchName[l.batch_id] : undefined}>
                    {l.batch_id ? (batchName[l.batch_id] ?? "Batch") : l.source ?? EMPTY}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted">{fmtDateTime(l.created_at, timezone)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={16 + extraKeys.length} className="px-3 py-8 text-center text-sm text-muted">
                  No leads match these filters. Upload a file under Upload leads, or clear the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-2 text-xs text-muted">
        Showing {rows.length} of {total}.{total > limit ? ` Only the newest ${limit} are listed: narrow the filters to see the rest.` : ""}
      </p>
    </div>
  );
}
