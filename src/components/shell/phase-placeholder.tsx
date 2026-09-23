import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PhasePlaceholder({
  icon: Icon,
  title,
  phase,
  description,
  bullets,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md animate-slide-up text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-blue-tint">
          <Icon className="h-6 w-6 text-brand-blue" />
        </div>
        <div className="mb-1 flex items-center justify-center gap-2">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <Badge variant="neutral">{phase}</Badge>
        </div>
        <p className="mb-4 text-sm text-muted">{description}</p>
        <ul className="space-y-1.5 text-left text-xs text-muted">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-line" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
