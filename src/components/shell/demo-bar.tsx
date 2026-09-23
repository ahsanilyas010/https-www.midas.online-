"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, RotateCcw, Loader2, Eye } from "lucide-react";
import { resetDemoData, switchPersona } from "@/lib/actions/demo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DemoAccount {
  id: string;
  name: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  ops_manager: "Ops manager",
  team_lead: "Team lead",
  qa: "QA",
  agent: "Agent",
  client_viewer: "Client",
};

// Thin gradient strip above the header: shows this is a demo, lets the
// presenter switch to any person's view, and re-seeds the data.
export function DemoBar({ accounts, currentId }: { accounts: DemoAccount[]; currentId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="relative flex h-9 shrink-0 items-center justify-between gap-2 overflow-hidden bg-brand-gradient px-3 text-xs text-white">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgb(255_255_255/0.15)_50%,transparent_70%)] bg-[length:200%_100%] animate-shimmer" />
      <div className="relative flex min-w-0 items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold-soft" />
        <span className="truncate font-medium">
          Demo mode <span className="hidden text-white/75 sm:inline">· sample data in memory, nothing is saved permanently</span>
        </span>
      </div>
      <div className="relative flex shrink-0 items-center gap-1.5">
        <Eye className="hidden h-3.5 w-3.5 text-white/80 sm:block" />
        <span className="hidden text-white/80 sm:inline">View as</span>
        <Select
          value={currentId}
          onValueChange={(id) =>
            startTransition(async () => {
              await switchPersona(id);
            })
          }
        >
          <SelectTrigger className="h-6 w-36 whitespace-nowrap border-white/25 bg-white/15 px-2 text-xs text-white sm:w-52 [&>span]:truncate [&_svg]:text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} · {ROLE_LABEL[a.role] ?? a.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await resetDemoData();
              toast.success("Demo data reset to a fresh sample");
              router.refresh();
            })
          }
          className="flex h-6 cursor-pointer items-center gap-1 rounded-md bg-white/15 px-2 ring-1 ring-white/25 hover:bg-white/25 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          <span className="hidden sm:inline">Reset data</span>
        </button>
      </div>
    </div>
  );
}
