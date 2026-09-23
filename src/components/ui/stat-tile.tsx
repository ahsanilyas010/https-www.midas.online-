import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { CountUp } from "@/components/ui/count-up";

// Decorative (non-semantic) accent rotation shared by stat tiles and nav
// icons — the CallMilalo palette: indigo, gold, emerald, amber, violet, magenta
// and teal. Semantic colours (danger/warning) are never used here.
export type AccentColor = "blue" | "green" | "orange" | "gold" | "violet" | "magenta" | "teal";

const ACCENT: Record<AccentColor, { chip: string; glow: string; bar: string }> = {
  blue: { chip: "from-[var(--brand-blue)] to-[var(--violet)]", glow: "bg-brand-blue", bar: "from-[var(--brand-blue)] to-[var(--violet)]" },
  green: { chip: "from-[var(--brand-green)] to-[var(--teal)]", glow: "bg-brand-green", bar: "from-[var(--brand-green)] to-[var(--teal)]" },
  orange: { chip: "from-[var(--brand-orange)] to-[var(--magenta)]", glow: "bg-brand-orange", bar: "from-[var(--brand-orange)] to-[var(--magenta)]" },
  gold: { chip: "from-[#fde68a] via-[var(--gold)] to-[#d97706]", glow: "bg-gold", bar: "from-[#fde68a] to-[#d97706]" },
  violet: { chip: "from-[var(--violet)] to-[var(--magenta)]", glow: "bg-violet", bar: "from-[var(--violet)] to-[var(--magenta)]" },
  magenta: { chip: "from-[var(--magenta)] to-[var(--brand-orange)]", glow: "bg-magenta", bar: "from-[var(--magenta)] to-[var(--brand-orange)]" },
  teal: { chip: "from-[var(--teal)] to-[var(--brand-blue)]", glow: "bg-teal", bar: "from-[var(--teal)] to-[var(--brand-blue)]" },
};

export function StatTile({
  icon: Icon,
  value,
  label,
  accent = "blue",
  className,
  style,
}: {
  icon: LucideIcon;
  value: React.ReactNode;
  label: string;
  accent?: AccentColor;
  className?: string;
  style?: React.CSSProperties;
}) {
  const colors = ACCENT[accent];
  return (
    <Card className={cn("group hover-lift animate-slide-up relative overflow-hidden", className)} style={style}>
      <span className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", colors.bar)} aria-hidden />
      <span
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl transition-opacity duration-300 group-hover:opacity-25",
          colors.glow,
        )}
        aria-hidden
      />
      <CardContent className="relative flex items-center gap-3 pt-5">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3",
            colors.chip,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-2xl font-semibold tabular text-ink">
            {typeof value === "number" || typeof value === "string" ? <CountUp value={value} /> : value}
          </div>
          <div className="truncate text-xs font-medium text-muted">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
