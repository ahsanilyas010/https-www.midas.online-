"use client";

import { useTransition, useState } from "react";
import { motion } from "framer-motion";
import { Crown, Briefcase, Users, Headset, ClipboardCheck, Building2, ArrowRight, Loader2, type LucideIcon } from "lucide-react";
import { signInAsPersona } from "@/lib/actions/demo";
import { cn } from "@/lib/utils";

interface Persona {
  id: string;
  email: string;
  role: string;
  title: string;
  blurb: string;
  name: string;
}

const ROLE_STYLE: Record<string, { icon: LucideIcon; gradient: string }> = {
  super_admin: { icon: Crown, gradient: "from-[var(--gold)] to-[var(--brand-orange)]" },
  ops_manager: { icon: Briefcase, gradient: "from-[var(--brand-blue)] to-[var(--violet)]" },
  team_lead: { icon: Users, gradient: "from-[var(--violet)] to-[var(--magenta)]" },
  agent: { icon: Headset, gradient: "from-[var(--teal)] to-[var(--brand-blue)]" },
  qa: { icon: ClipboardCheck, gradient: "from-[var(--brand-green)] to-[var(--teal)]" },
  client_viewer: { icon: Building2, gradient: "from-[var(--magenta)] to-[var(--gold)]" },
};

export function PersonaPicker({ personas, next }: { personas: Persona[]; next?: string }) {
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {personas.map((p, i) => {
        const style = ROLE_STYLE[p.role] ?? ROLE_STYLE.agent;
        const Icon = style.icon;
        const loading = pending && chosen === p.id;
        return (
          <motion.button
            key={p.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            disabled={pending}
            onClick={() => {
              setChosen(p.id);
              startTransition(async () => {
                await signInAsPersona(p.id, next);
              });
            }}
            className={cn(
              "group relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-xl border border-line bg-surface p-4 text-left shadow-sm transition-shadow",
              "hover:shadow-lg hover:shadow-[var(--brand-blue)]/10 disabled:cursor-wait",
            )}
          >
            <span
              className={cn(
                "absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80 transition-opacity group-hover:opacity-100",
                style.gradient,
              )}
              aria-hidden
            />
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                style.gradient,
              )}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{p.title}</span>
                <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" />
              </span>
              <span className="block text-xs font-medium text-brand-blue">{p.name}</span>
              <span className="mt-1 block text-xs text-muted">{p.blurb}</span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
