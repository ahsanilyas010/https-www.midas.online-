"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { TourStep } from "@/lib/guide/tours";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6; // breathing room around the highlighted element
const GAP = 14; // distance between the highlight and the card
const MARGIN = 12; // minimum distance from the viewport edge

// The first element with this data-tour value that is actually on screen
// (the sidebar is display:none on a phone, for example).
function findTarget(name: string | undefined): HTMLElement | null {
  if (!name) return null;
  const all = document.querySelectorAll<HTMLElement>("[data-tour]");
  for (const el of all) {
    if (el.getAttribute("data-tour") !== name) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

function sameBox(a: Box | null, b: Box | null) {
  if (!a || !b) return a === b;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

// A lightweight product tour: dims the page, cuts a spotlight around the
// current step's target and shows a card next to it. If a target is not on
// screen the card is simply centred. It never traps the user: Esc, the close
// button and "Skip tour" always end it, and the page behind stays reachable
// with the keyboard.
export function TourOverlay({
  steps,
  onClose,
}: {
  steps: TourStep[];
  // completed = the user reached the end (clicked Done) rather than skipping.
  onClose: (completed: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ w: 1024, h: 768 });
  const [cardSize, setCardSize] = useState({ w: 340, h: 200 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);

  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setViewport((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
    const el = findTarget(step?.target);
    if (!el) {
      setBox((b) => (b === null ? b : null));
      return;
    }
    const r = el.getBoundingClientRect();
    const next = { top: r.top, left: r.left, width: r.width, height: r.height };
    setBox((b) => (sameBox(b, next) ? b : next));
  }, [step?.target]);

  // Remember what had focus so it can be restored when the tour ends.
  useEffect(() => {
    returnFocus.current = document.activeElement;
    return () => {
      const el = returnFocus.current;
      if (el instanceof HTMLElement && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, []);

  // On each step: bring the target into view, measure, and keep it measured
  // while the layout moves (sidebar animation, resize, scrolling).
  useEffect(() => {
    const el = findTarget(step?.target);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    const id = window.setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step?.target, measure]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCardSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
  }, [index, box, viewport.w]);

  // Move focus to the primary button whenever the step changes.
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [index]);

  const goNext = useCallback(() => {
    if (last) onClose(true);
    else setIndex((i) => i + 1);
  }, [last, onClose]);
  const goBack = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goBack, onClose]);

  if (!step || typeof document === "undefined") return null;

  // Card position: beside the target when there is room, otherwise below or
  // above it, otherwise centred on screen.
  const cardW = Math.min(340, viewport.w - MARGIN * 2);
  const h = cardSize.h;
  let style: React.CSSProperties;
  if (box) {
    const hl = { top: box.top - PAD, left: box.left - PAD, right: box.left + box.width + PAD, bottom: box.top + box.height + PAD };
    const midY = (hl.top + hl.bottom) / 2;
    const midX = (hl.left + hl.right) / 2;
    if (hl.right + GAP + cardW <= viewport.w - MARGIN) {
      style = { top: clamp(midY - h / 2, MARGIN, viewport.h - h - MARGIN), left: hl.right + GAP };
    } else if (hl.bottom + GAP + h <= viewport.h - MARGIN) {
      style = { top: hl.bottom + GAP, left: clamp(midX - cardW / 2, MARGIN, viewport.w - cardW - MARGIN) };
    } else if (hl.top - GAP - h >= MARGIN) {
      style = { top: hl.top - GAP - h, left: clamp(midX - cardW / 2, MARGIN, viewport.w - cardW - MARGIN) };
    } else {
      style = { top: Math.max(MARGIN, (viewport.h - h) / 2), left: Math.max(MARGIN, (viewport.w - cardW) / 2) };
    }
  } else {
    style = { top: Math.max(MARGIN, (viewport.h - h) / 2), left: Math.max(MARGIN, (viewport.w - cardW) / 2) };
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-testid="tour-overlay">
      {/* Transparent shield so stray clicks do not hit the page mid-tour. */}
      <div className="absolute inset-0" aria-hidden />
      {box ? (
        <div
          data-testid="tour-spotlight"
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/80 transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
          }}
        />
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-slate-900/60" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        data-testid="tour-card"
        className="absolute rounded-2xl border border-line bg-surface p-4 shadow-2xl shadow-violet/20 transition-[top,left] duration-200 motion-reduce:transition-none"
        style={{ ...style, width: cardW }}
      >
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label="Close tour"
          className="absolute right-3 top-3 cursor-pointer rounded-md p-1 text-muted hover:bg-canvas hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted" aria-live="polite">
          Step {index + 1} of {steps.length}
        </p>
        <h2 className="mt-1 pr-6 font-display text-base font-semibold text-ink">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>

        <div className="mt-3 h-1 overflow-hidden rounded-full bg-canvas" aria-hidden>
          <div className="h-full rounded-full bg-brand-blue transition-all duration-200" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => onClose(false)} className="cursor-pointer text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={index === 0}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              ref={nextRef}
              type="button"
              onClick={goNext}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-brand-blue px-3 text-xs font-semibold text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
            >
              {last ? "Done" : "Next"} {!last && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
