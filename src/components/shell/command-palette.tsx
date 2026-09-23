"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, ArrowRight } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Ctrl/⌘+K quick switcher over the pages this role can see.
export function CommandPalette({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("dialdesk:open-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dialdesk:open-palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || i.label.toLowerCase().includes(q) || i.href.includes(q));
  }, [items, query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-violet/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="h-4 w-4 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIndex((i) => Math.min(i + 1, results.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => Math.max(i - 1, 0));
                  }
                  if (e.key === "Enter" && results[index]) go(results[index].href);
                }}
                placeholder="Jump to a page…"
                className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
              <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">Esc</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted">No matches</div>}
              {results.map((r, i) => (
                <button
                  key={r.href}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(r.href)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                    i === index ? "bg-brand-gradient text-white" : "text-ink hover:bg-canvas",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <ArrowRight className="h-3.5 w-3.5 opacity-70" /> {r.label}
                  </span>
                  {i === index && <CornerDownLeft className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
