import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// Fades/slides children in as they scroll into view. Pure CSS (a scroll-driven
// animation, see .reveal in globals.css): content is in the server HTML and
// fully visible without JavaScript, so crawlers and slow devices see it and
// browsers without scroll timelines simply show it straight away.
export function Reveal({
  children,
  delay = 0,
  className,
  y = 18,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const style = { "--reveal-y": `${y}px`, "--reveal-lag": `${Math.round(delay * 100)}%` } as CSSProperties;
  return (
    <div className={cn("reveal", className)} style={style}>
      {children}
    </div>
  );
}
