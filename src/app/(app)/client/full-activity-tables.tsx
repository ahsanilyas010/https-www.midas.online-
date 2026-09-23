"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClientCallLogRow, ClientFollowupRow, ClientLeadRow } from "@/lib/reports/client-full-visibility";

const PAGE_SIZE = 25;

const CATEGORY_BADGE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  connected_positive: "confirm",
  connected_neutral: "blue",
  connected_negative: "warning",
  no_contact: "neutral",
  invalid: "neutral",
  compliance: "danger",
};

function leadName(l: { first_name: string | null; last_name: string | null; company_name: string | null }) {
  return [l.first_name, l.last_name].filter(Boolean).join(" ") || l.company_name || "—";
}

function fmtMinSec(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Rendering all of a large client's rows into the DOM at once (this client
// has 500+ leads and 480+ call attempts) was a plausible source of the
// browser-side crash reported right after this section shipped — paginated
// client-side here since every row is already fetched server-side, so
// paging needs no extra round trip, just less DOM per page.
function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2 text-xs text-muted">
      <span>
        Page {page + 1} of {totalPages}
      </span>
      <Button variant="secondary" size="icon" disabled={page === 0} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="secondary"
        size="icon"
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function LeadsTable({ leads }: { leads: ClientLeadRow[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const pageRows = leads.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (leads.length === 0) return <p className="py-8 text-center text-sm text-muted">No leads yet.</p>;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Screening</th>
              <th className="px-4 py-2 font-medium">Assigned</th>
              <th className="px-4 py-2 font-medium text-right">Attempts</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((l) => (
              <tr key={l.id} className="h-[38px] border-b border-line last:border-0">
                <td className="px-4 py-1.5 font-medium text-ink">{leadName(l)}</td>
                <td className="px-4 py-1.5 tabular text-muted">{l.phone_e164}</td>
                <td className="px-4 py-1.5 text-xs text-muted">{l.campaign_code}</td>
                <td className="px-4 py-1.5">
                  {l.do_not_call ? (
                    <Badge variant="danger">Suppressed</Badge>
                  ) : (
                    <Badge variant="neutral">{l.status.replace(/_/g, " ")}</Badge>
                  )}
                </td>
                <td className="px-4 py-1.5 text-xs text-muted">{l.screening_status}</td>
                <td className="px-4 py-1.5 text-xs text-muted">
                  {l.assigned_agent_label ?? <span className="text-warning">Unassigned</span>}
                </td>
                <td className="px-4 py-1.5 tabular text-right text-muted">{l.attempt_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function CallLogTable({ callLog }: { callLog: ClientCallLogRow[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(callLog.length / PAGE_SIZE));
  const pageRows = callLog.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (callLog.length === 0) return <p className="py-8 text-center text-sm text-muted">No calls logged yet.</p>;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-4 py-2 font-medium">Agent</th>
              <th className="px-4 py-2 font-medium">Disposition</th>
              <th className="px-4 py-2 font-medium text-right">Talk</th>
              <th className="px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.id} className="h-[38px] border-b border-line last:border-0">
                <td className="px-4 py-1.5 tabular text-xs text-muted">
                  {new Date(c.started_at).toLocaleString()}
                </td>
                <td className="px-4 py-1.5 text-ink">
                  {leadName(c)} <span className="tabular text-muted">({c.phone_e164})</span>
                </td>
                <td className="px-4 py-1.5 text-xs text-muted">{c.agent_label ?? "—"}</td>
                <td className="px-4 py-1.5">
                  {c.disposition_label ? (
                    <Badge variant={CATEGORY_BADGE[c.category ?? ""] ?? "neutral"}>{c.disposition_label}</Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-1.5 tabular text-right text-muted">{fmtMinSec(c.talk_seconds)}</td>
                <td className="max-w-[240px] truncate px-4 py-1.5 text-muted" title={c.notes ?? undefined}>
                  {c.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function FollowupsTable({ followups }: { followups: ClientFollowupRow[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(followups.length / PAGE_SIZE));
  const pageRows = followups.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (followups.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No follow-ups scheduled.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Due</th>
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-4 py-2 font-medium">Agent</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Priority</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((f) => (
              <tr key={f.id} className="h-[38px] border-b border-line last:border-0">
                <td className="px-4 py-1.5 tabular text-xs text-muted">
                  {new Date(f.due_at).toLocaleString()}
                </td>
                <td className="px-4 py-1.5 text-ink">
                  {leadName(f)} <span className="tabular text-muted">({f.phone_e164})</span>
                </td>
                <td className="px-4 py-1.5 text-xs text-muted">{f.agent_label ?? "—"}</td>
                <td className="px-4 py-1.5 text-xs text-muted">{f.followup_type.replace(/_/g, " ")}</td>
                <td className="px-4 py-1.5">
                  <Badge variant={f.priority === "high" ? "danger" : f.priority === "low" ? "neutral" : "warning"}>
                    {f.priority}
                  </Badge>
                </td>
                <td className="px-4 py-1.5">
                  <Badge
                    variant={
                      f.status === "done" ? "confirm" : f.status === "missed" || f.status === "cancelled" ? "danger" : "warning"
                    }
                  >
                    {f.status}
                  </Badge>
                </td>
                <td className="max-w-[240px] truncate px-4 py-1.5 text-muted" title={f.note ?? undefined}>
                  {f.note ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export function FullActivityTabs({
  leads,
  callLog,
  followups,
}: {
  leads: ClientLeadRow[];
  callLog: ClientCallLogRow[];
  followups: ClientFollowupRow[];
}) {
  return (
    <Tabs defaultValue="leads">
      <TabsList className="mx-4 mt-1">
        <TabsTrigger value="leads">Leads ({leads.length})</TabsTrigger>
        <TabsTrigger value="calls">Call log ({callLog.length})</TabsTrigger>
        <TabsTrigger value="followups">Appointments ({followups.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="leads" className="mt-3">
        <LeadsTable leads={leads} />
      </TabsContent>
      <TabsContent value="calls" className="mt-3">
        <CallLogTable callLog={callLog} />
      </TabsContent>
      <TabsContent value="followups" className="mt-3">
        <FollowupsTable followups={followups} />
      </TabsContent>
    </Tabs>
  );
}
