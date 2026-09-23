import type { DemoStore } from "@/lib/demo/store";

// Only agents use a paid seat. Admins, managers, team leads, QA analysts and
// client logins are free on every plan.
export function activeAgentCount(store: DemoStore): number {
  return store.tables.profiles.filter((p) => p.role === "agent" && p.is_active).length;
}

export function seatLimitMessage(seats: number) {
  return `Your plan includes ${seats} agent${seats === 1 ? "" : "s"}, and they're all in use. Add seats under Plan & billing to create more agents.`;
}
