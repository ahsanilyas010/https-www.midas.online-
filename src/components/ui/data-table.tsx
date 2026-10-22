"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Sticky first / last columns for wide tables: put these on the <th> and <td>
// of the column. The row needs an opaque background (`bg-surface`) so the cell
// can inherit it, and the sticky cell hides what scrolls underneath.
export const STICKY_FIRST = "sticky left-0 z-[1] bg-inherit shadow-[1px_0_0_var(--color-line)]";
export const STICKY_LAST = "sticky right-0 z-[1] bg-inherit shadow-[-1px_0_0_var(--color-line)]";

// Scrolls sideways when the table is wider than the screen, with a soft edge
// on whichever side has more to see, so clipped columns are never a surprise.
export function TableWrap({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-surface", className)}>
      <div ref={ref} onScroll={measure} role="region" aria-label={label} tabIndex={0} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-brand-blue">
        {children}
      </div>
      {edges.left && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-ink/10 to-transparent" />}
      {edges.right && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-ink/10 to-transparent" />}
    </div>
  );
}
