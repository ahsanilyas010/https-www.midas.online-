import { useId } from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * Midas mark — a gold crown-shaped "M" on an indigo→magenta tile. Stands in
 * for the official midas.online logo until the real asset is dropped into
 * /public/brand (then swap this for an <img>).
 */
export function BrandMark({ className, size = 28 }: { className?: string; size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label={BRAND.productName}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-blue)" />
          <stop offset="55%" stopColor="var(--violet)" />
          <stop offset="100%" stopColor="var(--magenta)" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="55%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${id}-bg)`} />
      <path
        d="M11 33 L13.5 15 L19.5 24 L24 13 L28.5 24 L34.5 15 L37 33 Z"
        fill={`url(#${id}-gold)`}
        stroke="#fff7db"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <rect x="11" y="34.5" width="26" height="3" rx="1.5" fill={`url(#${id}-gold)`} />
      <circle cx="24" cy="12" r="2" fill="#fff7db" />
    </svg>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BrandMark />
      <div className="leading-none">
        <div className="text-sm font-semibold text-ink tracking-tight">{BRAND.productName}</div>
      </div>
    </div>
  );
}
