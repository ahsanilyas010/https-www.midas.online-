import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

// Shared brand-colour rotation for stat tiles, nav icons, and other
// decorative (non-semantic) accents — kept to the three exact brand hues
// rather than inventing off-brand colours (see globals.css).
export type AccentColor = "blue" | "green" | "orange";

const ACCENT: Record<AccentColor, { chip: string; icon: string; bar: string }> = {
  blue: { chip: "bg-brand-blue-tint", icon: "text-brand-blue", bar: "bg-brand-blue" },
  green: { chip: "bg-brand-green-tint", icon: "text-brand-green-text", bar: "bg-brand-green" },
  orange: { chip: "bg-brand-orange-tint", icon: "text-brand-orange-text", bar: "bg-brand-orange" },
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
    <Card className={cn("hover-lift animate-slide-up relative overflow-hidden", className)} style={style}>
      <span className={cn("absolute inset-x-0 top-0 h-1", colors.bar)} aria-hidden />
      <CardContent className="flex items-center gap-3 pt-5">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", colors.chip)}>
          <Icon className={cn("h-4.5 w-4.5", colors.icon)} />
        </span>
        <div className="min-w-0">
          <div className="text-2xl font-semibold tabular text-ink">{value}</div>
          <div className="truncate text-xs text-muted">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
