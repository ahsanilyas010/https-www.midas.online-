import { Badge } from "@/components/ui/badge";

// Shared bits of the lead-gen screens.

export const LEADGEN_ROLES = ["lead_gen", "super_admin", "ops_manager"] as const;

export interface LeadGenStats {
  added_today: number;
  added_7d: number;
  added_30d: number;
  pending: number;
  passed: number;
  failed: number;
  unassigned: number;
  assigned: number;
  total: number;
  by_source: { source: string; total: number; last7: number; pending: number; passed: number; assigned: number }[];
  trend: { day: string; source: string; count: number }[];
}

export const EMPTY_STATS: LeadGenStats = {
  added_today: 0,
  added_7d: 0,
  added_30d: 0,
  pending: 0,
  passed: 0,
  failed: 0,
  unassigned: 0,
  assigned: 0,
  total: 0,
  by_source: [],
  trend: [],
};

export function ScreeningBadge({ status }: { status: string }) {
  if (status === "passed") return <Badge variant="confirm">Passed</Badge>;
  if (status === "failed") return <Badge variant="danger">Failed</Badge>;
  if (status === "expired") return <Badge variant="warning">Expired</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  rejected: "Rejected",
};

export function LeadStatusBadge({ status }: { status: string }) {
  const variant =
    status === "converted" ? "confirm" : status === "rejected" ? "danger" : status === "new" ? "neutral" : "blue";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "created") return <Badge variant="confirm">Created</Badge>;
  if (outcome === "duplicate") return <Badge variant="warning">Duplicate</Badge>;
  if (outcome === "suppressed") return <Badge variant="danger">Suppressed</Badge>;
  if (outcome === "unauthorized") return <Badge variant="danger">Unauthorized</Badge>;
  if (outcome === "error") return <Badge variant="danger">Error</Badge>;
  return <Badge variant="warning">Invalid</Badge>;
}

export { fmtDateTime } from "@/lib/format";
