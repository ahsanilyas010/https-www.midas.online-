import Link from "next/link";
import { Building2, Sparkles } from "lucide-react";

export interface PlanInfo {
  workspaceName: string;
  plan: "free" | "paid";
  agentsUsed: number;
  agentSeats: number;
  canManageBilling: boolean;
}

// Strip above the header for customer workspaces (the demo shows DemoBar
// instead): workspace name, plan and agent seats, with an upgrade link.
export function PlanBar({ info }: { info: PlanInfo }) {
  const full = info.agentsUsed >= info.agentSeats;
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-midnight-gradient px-3 text-xs text-white">
      <div className="flex min-w-0 items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-gold-soft" />
        <span className="truncate font-medium">{info.workspaceName}</span>
        <span className="hidden text-white/60 sm:inline">· {info.plan === "free" ? "Free plan" : "Paid plan"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={full ? "text-gold-soft" : "text-white/75"}>
          {info.agentsUsed} of {info.agentSeats} agents
        </span>
        {info.canManageBilling && (
          <Link
            href="/admin/billing"
            className="inline-flex items-center gap-1 rounded-md bg-gold-gradient px-2 py-0.5 font-semibold text-ink hover:brightness-105"
          >
            <Sparkles className="h-3 w-3" /> {info.plan === "free" ? "Upgrade" : "Billing"}
          </Link>
        )}
      </div>
    </div>
  );
}
