import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { PLANS, PRICING, PRICING_FAQ } from "@/lib/pricing";
import { absoluteUrl, siteUrl } from "@/lib/site";
import { jsonLdHtml, organizationJsonLd } from "@/lib/structured-data";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { PricingCalculator } from "@/components/landing/pricing-calculator";
import { Reveal } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

const [growth, scale] = PRICING.tiers;

export const metadata: Metadata = {
  title: "Pricing: first 3 agents free",
  description: `${BRAND.productName} pricing: your first ${PRICING.freeUsers} agents are free, then $${growth.perUser} per agent per month, dropping to $${scale.perUser} from agent ${growth.upTo + 1}. Admins, managers and QA are always free.`,
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    siteName: BRAND.productName,
    title: `${BRAND.productName} pricing: first ${PRICING.freeUsers} agents free`,
    description: `Then $${growth.perUser}/agent/month, $${scale.perUser} from agent ${growth.upTo + 1}. Every feature included.`,
    url: "/pricing",
    images: ["/opengraph-image"],
  },
};

const INCLUDED = [
  "Dial workspace & scripts",
  "Bring-your-own dialer softphone",
  "Zoom meetings from any lead",
  "Live floor & performance",
  "Attendance, shifts & leave",
  "QA scorecards",
  "TPS/CTPS & US DNC screening",
  "Data imports & sourcing",
  "Email templates",
  "Client portal & PDF reports",
  "Roles, audit trail & security",
  "Follow-up tray & Ctrl+K",
];

function structuredData() {
  const org = organizationJsonLd();
  return {
    "@context": "https://schema.org",
    "@graph": [
      org,
      {
        "@type": "SoftwareApplication",
        name: BRAND.productName,
        url: siteUrl(),
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web browser",
        publisher: { "@id": org["@id"] },
        offers: [
          { "@type": "Offer", name: `Starter (1–${PRICING.freeUsers} agents)`, price: 0, priceCurrency: PRICING.currency, url: absoluteUrl("/pricing") },
          ...PRICING.tiers.map((t, i) => ({
            "@type": "Offer",
            name: i === 0 ? "Growth" : "Scale",
            url: absoluteUrl("/pricing"),
            priceCurrency: PRICING.currency,
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: t.perUser,
              priceCurrency: PRICING.currency,
              unitText: "agent per month",
              referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "agent", unitCode: "C62" },
            },
          })),
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: PRICING_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND.productName, item: siteUrl() },
          { "@type": "ListItem", position: 2, name: "Pricing", item: absoluteUrl("/pricing") },
        ],
      },
    ],
  };
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(structuredData())} />
      <SiteHeader />

      <main>
        <section className="brand-hero relative overflow-hidden px-4 pb-40 pt-32 text-center text-white sm:pt-36">
          <div className="brand-orb brand-orb-1" aria-hidden />
          <div className="brand-orb brand-orb-3" aria-hidden />
          <div className="relative mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gold-soft ring-1 ring-white/20">
              <Sparkles className="h-3.5 w-3.5" /> Every feature on every plan
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.1] sm:text-5xl">
              Your first {PRICING.freeUsers} agents are <span className="text-gold-gradient">free.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/75">
              Then ${growth.perUser} per agent per month, dropping to ${scale.perUser} from agent {growth.upTo + 1}. Admins, managers, team leads and QA
              are always free. No per-minute fees, no setup fees.
            </p>
          </div>
        </section>

        {/* Plans */}
        <section aria-label="Plans" className="relative -mt-28 px-4">
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div
                key={p.key}
                className={cn(
                  "relative flex flex-col rounded-3xl bg-white p-6 shadow-lg shadow-brand-blue/5 ring-1 ring-line",
                  p.highlight && "ring-2 ring-[var(--gold)] shadow-xl shadow-gold/20",
                )}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gold-gradient px-3 py-0.5 text-[11px] font-semibold text-ink shadow">Most teams</span>
                )}
                <h2 className="font-display text-lg font-semibold text-ink">{p.name}</h2>
                <div className="mt-1 text-xs font-medium text-brand-blue">{p.users}</div>
                <div className="mt-4 flex items-end gap-1.5">
                  <span className="font-display text-4xl font-semibold text-ink">{p.price}</span>
                  <span className="pb-1 text-xs text-muted">{p.priceNote}</span>
                </div>
                <p className="mt-3 text-sm text-muted">{p.blurb}</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-ink">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" /> {pt}
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.cta.href}
                  className={cn(
                    "mt-6 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                    p.highlight ? "bg-gold-gradient text-ink shadow-lg shadow-gold/20 hover:brightness-105" : "bg-canvas text-ink ring-1 ring-line hover:bg-white",
                  )}
                >
                  {p.cta.label} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Calculator */}
        <section id="calculator" className="scroll-mt-24 px-4 py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-blue">Estimate</div>
            <h2 className="mt-3 font-display text-3xl font-semibold text-ink sm:text-4xl">What would your team pay?</h2>
            <p className="mt-3 text-muted">
              Prices are graduated: the first {PRICING.freeUsers} agents are always free, and the ${scale.perUser} rate applies to every agent above {growth.upTo}.
            </p>
          </Reveal>
          <Reveal className="mx-auto mt-10 max-w-5xl">
            <PricingCalculator />
          </Reveal>
        </section>

        {/* Included */}
        <section className="bg-surface px-4 py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold text-ink">Included in every plan</h2>
            <p className="mt-3 text-muted">No feature gates. A 3-agent team gets the same product as a 300-seat floor.</p>
          </Reveal>
          <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-center gap-2.5 rounded-2xl bg-canvas px-4 py-3 text-sm text-ink ring-1 ring-line">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 px-4 py-20">
          <h2 className="text-center font-display text-3xl font-semibold text-ink">Pricing questions</h2>
          <div className="mx-auto mt-10 max-w-3xl space-y-3">
            {PRICING_FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-white p-5 ring-1 ring-line open:shadow-md">
                <summary className="cursor-pointer list-none font-semibold text-ink marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-brand-blue transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="brand-hero relative mx-auto max-w-5xl overflow-hidden rounded-3xl px-6 py-14 text-center text-white">
            <div className="brand-orb brand-orb-2" aria-hidden />
            <div className="relative">
              <h2 className="font-display text-3xl font-semibold">Start free today</h2>
              <p className="mx-auto mt-3 max-w-lg text-white/70">Create your workspace in two minutes: {PRICING.freeUsers} agents free, no card needed.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-xl bg-gold-gradient px-5 py-3 text-sm font-semibold text-ink shadow-lg shadow-gold/20 hover:brightness-105">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/login#demo" className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/15">
                  Try the live demo
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
