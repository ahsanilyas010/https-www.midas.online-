import { useId } from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * CallMilalo mark — a gold handset with call waves on an indigo→magenta tile.
 * Swap for a supplied logo by dropping it into /public/brand and replacing
 * this component with an <img>.
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
        d="M15.5 12.5c1-.9 2.6-.8 3.5.2l2.6 3c.8.9.8 2.3 0 3.2l-1.6 1.8c1.3 2.8 3.5 5 6.3 6.3l1.8-1.6c.9-.8 2.3-.8 3.2 0l3 2.6c1 .9 1.1 2.5.2 3.5l-1.5 1.7c-1.4 1.5-3.6 2.1-5.6 1.4-6.7-2.3-11.9-7.5-14.2-14.2-.7-2 0-4.2 1.4-5.6z"
        fill={`url(#${id}-gold)`}
      />
      <path d="M28 12.5a8 8 0 0 1 7.5 7.5" stroke="#fff7db" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M27.5 17.2a3.6 3.6 0 0 1 3.3 3.3" stroke="#fff7db" strokeWidth="2.2" strokeLinecap="round" fill="none" />
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
