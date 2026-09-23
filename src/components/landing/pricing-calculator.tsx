"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { PRICING, SELF_SERVE_MAX_USERS, annualMonthlyPrice, formatUsd, monthlyPrice } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const SLIDER_MAX = 250;

// Drag to a team size and see the monthly bill, broken down by price band.
export function PricingCalculator() {
  const [users, setUsers] = useState(12);
  const [annual, setAnnual] = useState(false);
  const custom = users > SELF_SERVE_MAX_USERS;

  const [growth, scale] = PRICING.tiers;
  const bands = [
    { label: `First ${PRICING.freeUsers} users`, count: Math.min(users, PRICING.freeUsers), rate: 0 },
    { label: `Users ${PRICING.freeUsers + 1}–${growth.upTo}`, count: Math.max(0, Math.min(users, growth.upTo) - PRICING.freeUsers), rate: growth.perUser },
    { label: `Users ${growth.upTo + 1}–${scale.upTo}`, count: Math.max(0, Math.min(users, scale.upTo) - growth.upTo), rate: scale.perUser },
  ];
  const perMonth = annual ? annualMonthlyPrice(users) : monthlyPrice(users);
  const pct = ((users - 1) / (SLIDER_MAX - 1)) * 100;

  return (
    <div className="grid overflow-hidden rounded-3xl bg-white shadow-xl shadow-brand-blue/10 ring-1 ring-line lg:grid-cols-[1.2fr_1fr]">
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="users" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Users className="h-5 w-5 text-brand-blue" /> How many users?
          </label>
          <div role="group" aria-label="Billing period" className="inline-flex rounded-full bg-canvas p-1 text-xs font-semibold">
            {[
              { v: false, l: "Monthly" },
              { v: true, l: `Yearly · ${12 - PRICING.annualMonthsCharged} months free` },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                aria-pressed={annual === o.v}
                onClick={() => setAnnual(o.v)}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1.5 transition",
                  annual === o.v ? "bg-brand-gradient text-white shadow" : "text-muted hover:text-ink",
                )}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-end gap-3">
          <span className="font-display text-6xl font-semibold tabular text-ink">{custom ? `${SELF_SERVE_MAX_USERS}+` : users}</span>
          <span className="pb-2 text-sm text-muted">{users === 1 ? "user" : "users"}</span>
        </div>
        <input
          id="users"
          type="range"
          min={1}
          max={SLIDER_MAX}
          value={users}
          onChange={(e) => setUsers(Number(e.target.value))}
          aria-valuetext={`${users} users`}
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full accent-[var(--brand-blue)]"
          style={{ background: `linear-gradient(90deg, var(--brand-blue) ${pct}%, var(--line) ${pct}%)` }}
        />
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>1</span>
          <span>{growth.upTo}</span>
          <span>{scale.upTo}</span>
          <span>{SLIDER_MAX}</span>
        </div>

        <ul className="mt-8 space-y-2.5 text-sm">
          {bands.map((b) => (
            <li key={b.label} className={cn("flex items-center justify-between gap-3", b.count === 0 && "opacity-40")}>
              <span className="text-ink">
                {b.label}{" "}
                <span className="text-muted">
                  · {b.count} × {b.rate === 0 ? "free" : `$${b.rate}`}
                </span>
              </span>
              <span className="tabular font-medium text-ink">{formatUsd(b.count * b.rate)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="brand-hero relative flex flex-col justify-between gap-6 overflow-hidden p-6 text-white sm:p-8">
        <div className="brand-orb brand-orb-2" aria-hidden />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-soft">Your estimate</div>
          {custom ? (
            <>
              <div className="mt-3 font-display text-4xl font-semibold">Let&apos;s talk</div>
              <p className="mt-2 text-sm text-white/70">
                Above {SELF_SERVE_MAX_USERS} users we put together volume pricing for your floor.
              </p>
            </>
          ) : (
            <>
              <div className="mt-3 flex items-end gap-2">
                <span className="font-display text-5xl font-semibold tabular text-gold-gradient">{formatUsd(perMonth)}</span>
                <span className="pb-1.5 text-sm text-white/70">/ month</span>
              </div>
              <p className="mt-2 text-sm text-white/70">
                {perMonth === 0
                  ? `Free: up to ${PRICING.freeUsers} users cost nothing.`
                  : annual
                    ? `${formatUsd(perMonth * 12)} billed yearly (${PRICING.annualMonthsCharged} months charged).`
                    : `About ${formatUsd(perMonth / users)} per user on average.`}
              </p>
            </>
          )}
        </div>
        <div className="relative space-y-3">
          <p className="text-xs text-white/60">Call minutes are billed by your own dialer provider. Client portal logins are free.</p>
          <Link
            href={custom || perMonth > 0 ? "/contact" : "/login"}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gold-gradient px-4 py-3 text-sm font-semibold text-ink shadow-lg shadow-gold/20 hover:brightness-105"
          >
            {custom ? "Contact sales" : perMonth > 0 ? "Get started" : "Try the live demo"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
