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
};

// Per-icon (not per-position) colour so a given section always gets the
// same accent regardless of which other items a given role sees — kept to
// the three brand hues, same rotation as StatTile.
const ICON_COLOR: Record<NavIconName, { icon: string; active: string }> = {
  Activity: { icon: "text-brand-blue", active: "bg-brand-blue-tint text-brand-blue" },
  BarChart3: { icon: "text-brand-green-text", active: "bg-brand-green-tint text-brand-green-text" },
  Users: { icon: "text-brand-orange-text", active: "bg-brand-orange-tint text-brand-orange-text" },
  Megaphone: { icon: "text-brand-blue", active: "bg-brand-blue-tint text-brand-blue" },
  CalendarCheck: { icon: "text-brand-green-text", active: "bg-brand-green-tint text-brand-green-text" },
  ShieldCheck: { icon: "text-brand-orange-text", active: "bg-brand-orange-tint text-brand-orange-text" },
  Database: { icon: "text-brand-blue", active: "bg-brand-blue-tint text-brand-blue" },
  Lock: { icon: "text-brand-green-text", active: "bg-brand-green-tint text-brand-green-text" },
  Headset: { icon: "text-brand-orange-text", active: "bg-brand-orange-tint text-brand-orange-text" },
  Building2: { icon: "text-brand-blue", active: "bg-brand-blue-tint text-brand-blue" },
};

export function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <motion.aside
        animate={{ width: collapsed ? 56 : 208 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-screen shrink-0 flex-col border-r border-line bg-white"
      >
        <div
          className="flex h-12 items-center gap-2 border-b border-line px-3"
          style={{ background: "linear-gradient(to bottom, var(--brand-blue-tint), transparent)" }}
        >
          <BrandMark size={22} />
          {!collapsed && (
            <span className="truncate font-display text-sm font-semibold text-ink">{BRAND.productName}</span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = ICON_MAP[item.icon];
            const colors = ICON_COLOR[item.icon];
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group relative mx-2 mb-0.5 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                  active ? cn(colors.active, "font-medium") : "text-muted hover:bg-canvas hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-md ring-1 ring-current/15"
                    transition={{ duration: 0.18 }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110",
                    !active && colors.icon,
                  )}
                />
                {!collapsed && <span className="relative truncate">{item.label}</span>}
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

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-10 items-center justify-center border-t border-line text-muted hover:bg-canvas hover:text-ink cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </motion.aside>
    </TooltipProvider>
  );
}
