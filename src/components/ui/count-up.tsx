"use client";

import { useEffect, useRef, useState } from "react";

// Animates the numeric part of a value ("1,284", "37%", "4m 12s" keeps its
// suffix) from 0 on first paint. Non-numeric values render as-is.
export function CountUp({ value, duration = 900 }: { value: number | string; duration?: number }) {
  const text = String(value);
  const match = text.match(/^(-?[\d,]*\.?\d+)(.*)$/);
  const target = match ? Number(match[1].replace(/,/g, "")) : NaN;
  const decimals = match && match[1].includes(".") ? match[1].split(".")[1].length : 0;
  const suffix = match ? match[2] : "";
  const [shown, setShown] = useState<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(target * eased);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  if (Number.isNaN(target)) return <>{text}</>;
  const n = shown ?? target;
  const formatted = n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <>
      {formatted}
      {suffix}
    </>
  );
}
