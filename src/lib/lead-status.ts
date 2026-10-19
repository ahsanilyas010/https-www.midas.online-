export const LEAD_STATUSES = ["new", "assigned", "contacted", "qualified", "converted", "rejected"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Statuses an agent may set on their own lead (new/assigned are managed by
// assignment, not picked by hand).
export const AGENT_LEAD_STATUSES: LeadStatus[] = ["contacted", "qualified", "converted", "rejected"];

export const SCREENING_BADGE: Record<string, "confirm" | "danger" | "warning" | "neutral"> = {
  passed: "confirm",
  failed: "danger",
  expired: "warning",
  pending: "warning",
};
