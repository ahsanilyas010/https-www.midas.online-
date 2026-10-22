"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A thin bar across the top that starts the moment an in-app link is clicked
// and finishes when the new page arrives, so a slow page never feels ignored.
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (timer.current) clearTimeout(timer.current);
      setState("loading");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The route changed: finish the bar, then hide it.
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    timer.current = setTimeout(() => setState("idle"), 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5">
      <div
        className="h-full bg-brand-blue transition-[width,opacity] ease-out"
        style={{ width: state === "loading" ? "80%" : "100%", opacity: state === "done" ? 0 : 1, transitionDuration: state === "loading" ? "8s" : "250ms" }}
      />
    </div>
  );
}
