import { Headset, Video, Activity, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "./login-form";
import { PersonaPicker } from "./persona-picker";
import { BrandMark } from "@/components/brand/mark";
import { BRAND } from "@/lib/brand";
import { DEMO_PERSONAS, DEMO_PASSWORD } from "@/lib/demo/seed";
import { AccountList } from "./account-list";
import { getStore } from "@/lib/demo/store";

const HIGHLIGHTS = [
  { icon: Headset, title: "Power-dial workspace", text: "Scripts, dispositions and callbacks in one screen." },
  { icon: Video, title: "Zoom built in", text: "Book, start and review Zoom meetings from any lead." },
  { icon: Activity, title: "Live floor", text: "See every agent's state, calls and conversions in real time." },
  { icon: ShieldCheck, title: "Compliance first", text: "TPS/DNC screening, audit trail and QA scorecards." },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const store = getStore();
  const profiles = store.tables.profiles;
  const accounts = store.tables.demo_auth
    .map((a) => {
      const p = profiles.find((x) => x.id === a.id);
      return p && p.is_active
        ? { id: a.id as string, email: a.email as string, name: p.full_name as string, role: p.role as string, team: (store.tables.teams.find((t) => t.id === p.team_id)?.name as string) ?? null }
        : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const personas = DEMO_PERSONAS.map((p) => ({
    ...p,
    name: (profiles.find((x) => x.id === p.id)?.full_name as string) ?? p.title,
  }));

  return (
    <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Hero */}
      <div className="brand-hero relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="brand-orb brand-orb-1" aria-hidden />
        <div className="brand-orb brand-orb-2" aria-hidden />
        <div className="brand-orb brand-orb-3" aria-hidden />

        <div className="relative flex items-center gap-3">
          <div className="rounded-2xl bg-white/10 p-2.5 ring-1 ring-white/20 backdrop-blur">
            <BrandMark size={34} />
          </div>
          <div>
            <div className="font-display text-xl font-semibold">{BRAND.productName}</div>
            <div className="text-xs text-white/70">{BRAND.loginTagline}</div>
          </div>
        </div>

        <div className="relative max-w-lg">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gold-soft ring-1 ring-white/20">
            <Sparkles className="h-3.5 w-3.5" /> Interactive demo
          </span>
          <h2 className="mt-4 font-display text-4xl font-semibold leading-tight">
            Every call, <span className="text-gold-gradient">one desk.</span>
          </h2>
          <p className="mt-3 text-sm text-white/75">
            A contact-centre CRM with a dial workspace, live floor, attendance, QA, compliance and
            Zoom meetings in one place. Pick a role on the right to try it with realistic data.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }, i) => (
              <div
                key={title}
                className={`animate-slide-up stagger-${i + 1} rounded-xl bg-white/[0.07] p-3.5 ring-1 ring-white/15 backdrop-blur transition hover:bg-white/[0.12]`}
              >
                <Icon className="h-5 w-5 text-gold-soft" />
                <div className="mt-2 text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-xs text-white/65">{text}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/50">
          Demo build. No database is connected; data is generated in memory and resets whenever you like.
        </p>
      </div>

      {/* Sign-in */}
      <div className="relative flex items-center justify-center overflow-hidden bg-canvas px-4 py-10">
        <div className="brand-mesh absolute inset-0" aria-hidden />
        <div className="relative w-full max-w-xl animate-slide-up">
          <div className="mb-6 flex flex-col items-center gap-2 text-center lg:hidden">
            <BrandMark size={40} />
            <h1 className="font-display text-xl font-semibold text-ink">{BRAND.productName}</h1>
            <p className="text-xs text-muted">{BRAND.loginTagline}</p>
          </div>

          <h2 className="font-display text-2xl font-semibold text-ink">Choose a demo role</h2>
          <p className="mt-1 text-sm text-muted">
            Each role sees the app the way that person would. You can switch any time from the demo bar.
          </p>

          <PersonaPicker personas={personas} next={next} />

          <div className="mt-6 rounded-xl border border-line bg-surface/90 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-ink">All demo accounts</div>
              <div className="text-xs text-muted">
                Same password for everyone:{" "}
                <span className="rounded-md bg-gold-tint px-1.5 py-0.5 font-mono font-semibold text-gold-text ring-1 ring-gold/40">
                  {DEMO_PASSWORD}
                </span>
              </div>
            </div>
            <AccountList accounts={accounts} next={next} />
            <details className="group mt-3">
              <summary className="cursor-pointer select-none text-xs font-medium text-brand-blue">
                Sign in with email and password instead
              </summary>
              <div className="mt-3">
                <LoginForm next={next} />
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
