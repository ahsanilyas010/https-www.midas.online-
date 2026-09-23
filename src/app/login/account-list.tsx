"use client";

import { useState, useTransition } from "react";
import { Loader2, LogIn } from "lucide-react";
import { signInAsPersona } from "@/lib/actions/demo";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  ops_manager: "Ops manager",
  team_lead: "Team lead",
  qa: "QA",
  agent: "Agent",
  client_viewer: "Client",
};

const ROLE_VARIANT: Record<string, "gold" | "blue" | "violet" | "teal" | "confirm" | "magenta"> = {
  super_admin: "gold",
  ops_manager: "blue",
  team_lead: "violet",
  qa: "confirm",
  agent: "teal",
  client_viewer: "magenta",
};

interface Account {
  id: string;
  email: string;
  name: string;
  role: string;
  team: string | null;
}

// Every person on the People page, one click to sign in as them.
export function AccountList({ accounts, next }: { accounts: Account[]; next?: string }) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="mt-3 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
      {accounts.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={pending}
          onClick={() => {
            setChosen(a.id);
            startTransition(async () => {
              await signInAsPersona(a.id, next);
            });
          }}
          className="group flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-blue-tint/50 disabled:cursor-wait"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink">{a.name}</span>
              <Badge variant={ROLE_VARIANT[a.role] ?? "neutral"}>{ROLE_LABEL[a.role] ?? a.role}</Badge>
              {a.team && <span className="hidden text-[11px] text-muted sm:inline">{a.team}</span>}
            </div>
            <div className="truncate font-mono text-[11px] text-muted">{a.email}</div>
          </div>
          {pending && chosen === a.id ? (
            <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
          ) : (
            <LogIn className="h-4 w-4 text-muted transition-colors group-hover:text-brand-blue" />
          )}
        </button>
      ))}
    </div>
  );
}
