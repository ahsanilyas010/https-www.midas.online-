"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  BarChart3,
  Users,
  Megaphone,
  CalendarCheck,
  ShieldCheck,
  Database,
  Lock,
  Headset,
  Building2,
  Video,
  PlugZap,
  CreditCard,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "@/components/brand/mark";
import type { NavItem, NavIconName } from "@/lib/nav";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

// NavItem.icon arrives as a string name (see lib/nav.ts for why) — resolve
// it to the actual component here, client-side.
const ICON_MAP: Record<NavIconName, LucideIcon> = {
  Activity,
  BarChart3,
  Users,
  Megaphone,
  CalendarCheck,
  ShieldCheck,
  Database,
  Lock,
  Headset,
  Building2,
  Video,
  PlugZap,
  CreditCard,
};

// Per-icon (not per-position) gradient so a section always keeps the same
// colour whichever other items a role sees.
const ICON_GRADIENT: Record<NavIconName, string> = {
  Activity: "from-[#34d399] to-[var(--teal)]",
  BarChart3: "from-[var(--gold)] to-[#f97316]",
  Users: "from-[#f472b6] to-[var(--magenta)]",
  Megaphone: "from-[#a78bfa] to-[var(--violet)]",
  CalendarCheck: "from-[#38bdf8] to-[var(--brand-blue)]",
  ShieldCheck: "from-[#34d399] to-[#059669]",
  Database: "from-[#818cf8] to-[var(--brand-blue)]",
  Lock: "from-[#fb7185] to-[#e11d48]",
  Headset: "from-[var(--gold)] to-[#ea580c]",
  Building2: "from-[#22d3ee] to-[var(--teal)]",
  Video: "from-[#60a5fa] to-[#0b5cff]",
  PlugZap: "from-[#c084fc] to-[var(--magenta)]",
  CreditCard: "from-[var(--gold)] to-[#f59e0b]",
};

export function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // The longest matching href wins, so /admin doesn't light up on /admin/people.
  const activeHref = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <TooltipProvider delayDuration={200}>
      <motion.aside
        animate={{ width: collapsed ? 68 : 232 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-screen shrink-0 flex-col overflow-hidden bg-midnight-gradient text-white"
      >
        <div className="pointer-events-none absolute -left-16 top-24 h-48 w-48 rounded-full bg-violet/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-20 bottom-20 h-48 w-48 rounded-full bg-gold/15 blur-3xl" aria-hidden />

        <Link
          href="/"
          title={`${BRAND.productName} home`}
          className="relative flex h-14 items-center gap-2.5 border-b border-white/10 px-4 transition-colors hover:bg-white/[0.04]"
        >
          <BrandMark size={28} />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate font-display text-sm font-semibold">{BRAND.productName}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-gold-soft/80">Contact centre</div>
            </div>
          )}
        </Link>

        <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
          {items.map((item, idx) => {
            const active = item.href === activeHref;
            const Icon = ICON_MAP[item.icon];
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group relative mb-1 flex h-10 items-center gap-3 rounded-xl px-2 text-sm transition-colors",
                  active ? "text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-xl bg-white/[0.11] ring-1 ring-white/15"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  >
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-x-2.5 -translate-y-1/2 rounded-r-full bg-gold-gradient" />
                  </motion.span>
                )}
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.025 }}
                  className={cn(
                    "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-3",
                    ICON_GRADIENT[item.icon],
                    !active && "opacity-85",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-white" />
                </motion.span>
                {!collapsed && <span className="relative truncate font-medium">{item.label}</span>}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>

        {!collapsed && (
          <div className="relative mx-3 mb-3 rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gold-soft">
              <Sparkles className="h-3.5 w-3.5" /> Quick tip
            </div>
            <p className="mt-1 text-[11px] leading-snug text-white/60">
              Press <kbd className="rounded bg-white/10 px-1">Ctrl</kbd> + <kbd className="rounded bg-white/10 px-1">K</kbd> to jump anywhere.
            </p>
          </div>
        )}

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="relative flex h-11 cursor-pointer items-center justify-center border-t border-white/10 text-white/60 hover:bg-white/[0.06] hover:text-white"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </motion.aside>
    </TooltipProvider>
  );
}
