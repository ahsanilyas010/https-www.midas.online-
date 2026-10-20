import type { LucideIcon } from "lucide-react";

// A friendly "nothing here yet" panel: what this is, why it matters, and the
// one button that gets the user going. Keep the copy to a couple of lines.
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue-tint text-brand-blue" aria-hidden>
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-display text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{children}</p>
      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
