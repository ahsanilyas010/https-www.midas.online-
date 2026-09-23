"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#f5b301", "#7c3aed", "#db2777", "#0891b2", "#10b981", "#4338ca", "#fde68a"];

// Lightweight CSS confetti burst — fired when an agent books a conversion.
// `fire` is a counter: each increment launches a new burst.
export function Confetti({ fire }: { fire: number }) {
  const [bursts, setBursts] = useState<number[]>([]);

  useEffect(() => {
    if (!fire) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setBursts((b) => [...b, fire]);
    const t = setTimeout(() => setBursts((b) => b.filter((x) => x !== fire)), 2200);
    return () => clearTimeout(t);
  }, [fire]);

  if (typeof document === "undefined" || bursts.length === 0) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden>
      {bursts.map((b) =>
        Array.from({ length: 70 }, (_, i) => {
          const left = 30 + Math.random() * 40;
          const dx = (Math.random() - 0.5) * 700;
          const dy = -(250 + Math.random() * 350);
          const rot = Math.random() * 720;
          const size = 6 + Math.random() * 6;
          return (
            <span
              key={`${b}-${i}`}
              className="absolute top-[60%] block rounded-[2px]"
              style={
                {
                  left: `${left}%`,
                  width: size,
                  height: size * 0.45,
                  background: COLORS[i % COLORS.length],
                  animation: `confetti-pop 1.9s cubic-bezier(0.2, 0.7, 0.3, 1) forwards`,
                  "--dx": `${dx}px`,
                  "--dy": `${dy}px`,
                  "--rot": `${rot}deg`,
                } as React.CSSProperties
              }
            />
          );
        }),
      )}
    </div>,
    document.body,
  );
}
