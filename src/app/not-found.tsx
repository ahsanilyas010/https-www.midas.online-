import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Home } from "lucide-react";
import { BrandMark } from "@/components/brand/mark";
import { BRAND } from "@/lib/brand";

// Override the root layout's "index, follow" so the tags agree.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="brand-hero relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center text-white">
      <div className="brand-orb brand-orb-1" aria-hidden />
      <div className="brand-orb brand-orb-2" aria-hidden />
      <div className="relative flex flex-col items-center">
        <BrandMark size={44} />
        <p className="mt-6 font-display text-6xl font-semibold text-gold-gradient">404</p>
        <h1 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">That line isn&apos;t connected</h1>
        <p className="mt-3 max-w-md text-sm text-white/70">
          The page you were looking for doesn&apos;t exist or has moved. Head back to {BRAND.productName} or jump straight into the live demo.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/15"
          >
            <Home className="h-4 w-4" /> {BRAND.productName} home
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-sm font-semibold text-ink shadow-lg shadow-gold/20 hover:brightness-105"
          >
            Try the live demo <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
