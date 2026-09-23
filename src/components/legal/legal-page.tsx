import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";

// Shared layout for the Terms and Privacy pages.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main className="px-4 pb-20 pt-28">
        <article className="mx-auto max-w-3xl rounded-3xl bg-white p-6 ring-1 ring-line sm:p-10 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          <h1 className="font-display text-3xl font-semibold text-ink sm:text-4xl">{title}</h1>
          <p className="!mt-2 text-sm text-muted">Last updated {updated}</p>
          <div className="text-[15px] leading-relaxed text-ink/85">{children}</div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
