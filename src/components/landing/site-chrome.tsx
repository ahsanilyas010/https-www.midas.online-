import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "lucide-react";
import { BrandMark } from "@/components/brand/mark";
import { BRAND, COMPANY, companyAddressLine } from "@/lib/brand";

// Header and footer shared by the public pages (landing, pricing, contact).

export async function demoCta() {
  const signedIn = Boolean((await cookies()).get("callmilalo_demo_user")?.value);
  return {
    signedIn,
    href: signedIn ? "/start" : "/login",
    label: signedIn ? "Open the app" : "Try the live demo",
    shortLabel: signedIn ? "App" : "Demo",
  };
}

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/#dialer", label: "Dialer" },
  { href: "/#zoom", label: "Zoom" },
  { href: "/#compliance", label: "Compliance" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export async function SiteHeader() {
  const cta = await demoCta();
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-midnight/70 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <BrandMark size={30} />
          <span className="font-display text-lg font-semibold">{BRAND.productName}</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-white/70 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-white">
              {n.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/pricing" className="rounded-lg px-2 py-2 text-sm font-medium text-white/80 hover:text-white md:hidden">
            Pricing
          </Link>
          {!cta.signedIn && (
            <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:text-white sm:block">
              Sign in
            </Link>
          )}
          <Link
            href={cta.href}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-gold-gradient px-3 py-2 text-sm sm:px-4 font-semibold text-ink shadow-lg shadow-gold/20 transition hover:brightness-105"
          >
            <span className="sm:hidden">{cta.shortLabel}</span>
            <span className="hidden sm:inline">{cta.label}</span> <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "All features" },
      { href: "/#workspace", label: "Dial workspace" },
      { href: "/#dialer", label: "Bring your own dialer" },
      { href: "/#zoom", label: "Zoom meetings" },
      { href: "/#floor", label: "Live floor" },
      { href: "/#compliance", label: "Compliance" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/contact", label: "Contact us" },
      { href: "/#roles", label: "Roles" },
      { href: "/#faq", label: "FAQ" },
      { href: "/login", label: "Live demo" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-12">
      <div className="mx-auto grid max-w-6xl gap-10 text-sm text-muted sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <BrandMark size={26} />
            <span className="font-display text-base font-semibold text-ink">{BRAND.productName}</span>
          </Link>
          <p className="mt-3 max-w-xs">{BRAND.loginTagline}</p>
          <address className="mt-4 not-italic leading-relaxed">
            <span className="font-semibold text-ink">{COMPANY.legalName}</span>
            <br />
            {companyAddressLine()}
          </address>
          {(COMPANY.phone || COMPANY.email) && (
            <p className="mt-2 flex flex-wrap gap-x-4">
              {COMPANY.phone && (
                <a href={`tel:${COMPANY.phone.replace(/\s+/g, "")}`} className="hover:text-brand-blue">
                  {COMPANY.phone}
                </a>
              )}
              {COMPANY.email && (
                <a href={`mailto:${COMPANY.email}`} className="hover:text-brand-blue">
                  {COMPANY.email}
                </a>
              )}
            </p>
          )}
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-ink">{col.title}</div>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-6xl border-t border-line pt-6 text-xs text-muted">
        © {new Date().getFullYear()} {COMPANY.legalName}. {BRAND.productName} is a product of {COMPANY.legalName}. All rights reserved.
        Third-party names belong to their owners and are shown to indicate compatibility.
      </p>
    </footer>
  );
}
