"use client";

import { useState, useTransition } from "react";
import { Loader2, LogIn, Sparkles } from "lucide-react";
import { signInAsRealDemoPersona } from "@/lib/actions/real-demo";
import type { RealDemoPersona } from "@/lib/actions/real-demo";

// Only ever rendered when NEXT_PUBLIC_DEMO_MODE=true (checked server-side
// in page.tsx, which passes an empty list otherwise) — the real,
// Postgres-backed "demo" workspace's role switcher (spec, Phase 9),
// distinct from the persona picker above it on this page.
export function RealDemoPicker({ personas }: { personas: RealDemoPersona[] }) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (personas.length === 0) return null;

  return (
    <div className="mt-8 rounded-xl border border-brand-blue/30 bg-brand-blue-tint/40 p-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Sparkles className="h-4 w-4 text-brand-blue" /> Try the real system (demo mode)
      </div>
      <p className="mt-1 text-xs text-muted">
        Signs into the real, database-backed demo workspace. Calls only ever reach the numbers on its allow-list.
      </p>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {personas.map((p) => (
          <button
            key={p.email}
            type="button"
            disabled={pending}
            onClick={() => {
              setChosen(p.email);
              setError(null);
              startTransition(async () => {
                const res = await signInAsRealDemoPersona(p.email);
                if (res?.error) setError(res.error);
              });
            }}
            className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs shadow-sm ring-1 ring-line hover:ring-brand-blue-tint-2 disabled:cursor-wait"
          >
            <span>
              <span className="font-medium text-ink">{p.fullName}</span>
              <span className="ml-1.5 text-muted">{p.roleLabel}</span>
            </span>
            {pending && chosen === p.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5 text-muted" />}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
