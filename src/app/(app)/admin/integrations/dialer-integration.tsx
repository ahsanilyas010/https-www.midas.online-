"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Check, Loader2, Unplug, PhoneCall, Code2, ExternalLink, ShieldCheck, ArrowLeftRight, KeyRound, LogIn, Phone } from "lucide-react";
import { connectDialer, disconnectDialer, updateDialerSettings, type DialerState } from "@/lib/actions/dialer";
import { DIALER_PROVIDERS, CAPABILITY_LABEL, providerMeta } from "@/lib/telephony/providers";
import type { DialMode, DialerProviderMeta, ProviderHttpRequest } from "@/lib/telephony/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const DIAL_MODES: { key: DialMode; label: string; text: string }[] = [
  { key: "click_to_call", label: "Click-to-call", text: "Agent clicks Call on a lead." },
  { key: "preview", label: "Preview", text: "Next lead shown, agent starts the call." },
  { key: "power", label: "Power", text: "Next lead dialled automatically after wrap-up." },
];

function Tile({ p, size = 40 }: { p: DialerProviderMeta; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-display font-bold text-white shadow-md"
      style={{ background: p.color, width: size, height: size, fontSize: size * 0.32 }}
    >
      {p.initials}
    </span>
  );
}

export interface DialerStats {
  callsToday: number;
  connectRate: string;
  avgDuration: string;
}

export function DialerIntegration({
  state,
  previews,
  stats,
}: {
  state: DialerState;
  previews: Record<string, ProviderHttpRequest | null>;
  stats: DialerStats;
}) {
  const active = state.connected ? providerMeta(state.provider) : undefined;
  const [settings, setSettings] = useState(state.settings);
  const [connecting, setConnecting] = useState<DialerProviderMeta | null>(null);
  const [devProvider, setDevProvider] = useState<string>(state.provider ?? "dialpad");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(next: typeof settings) {
    setSettings(next);
    startTransition(async () => {
      const r = await updateDialerSettings(next);
      if (r.error) toast.error(r.error);
      else toast.success("Dialer settings saved");
    });
  }

  const preview = previews[devProvider];
  const devMeta = providerMeta(devProvider);

  return (
    <div className="space-y-4">
      {/* Active dialer */}
      <Card className="overflow-hidden">
        <div
          className="relative overflow-hidden p-5 text-white"
          style={{
            background: active
              ? `linear-gradient(135deg, ${active.color} 0%, var(--violet) 70%, var(--magenta) 100%)`
              : "var(--midnight-gradient)",
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-lg">
                {active ? <Tile p={active} size={36} /> : <PhoneCall className="h-6 w-6 text-brand-blue" />}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-semibold">Dialer · {active ? active.name : "not connected"}</h3>
                  {active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-medium text-emerald-100 ring-1 ring-emerald-300/40">
                      <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-emerald-300" /> Connected
                    </span>
                  )}
                </div>
                <div className="text-sm text-white/80">
                  {active
                    ? `${state.plan ?? active.name} · caller ID ${settings.caller_id}`
                    : "Connect the calling service your team already pays for. Every Call button in the CRM then uses it."}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white/15 text-white">Demo mode</Badge>
              {active && (
                <Button
                  variant="secondary"
                  className="bg-white/15 text-white hover:bg-white/25"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await disconnectDialer();
                      if (r.error) toast.error(r.error);
                      else {
                        toast.success("Dialer disconnected");
                        router.refresh();
                      }
                    })
                  }
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />} Disconnect
                </Button>
              )}
            </div>
          </div>
          {active && (
            <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Calls today", value: stats.callsToday },
                { label: "Answered", value: stats.connectRate },
                { label: "Avg talk time", value: stats.avgDuration },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-white/10 px-2 py-2 ring-1 ring-white/15">
                  <div className="font-display text-lg font-semibold tabular">{s.value}</div>
                  <div className="text-[11px] text-white/70">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {active && (
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="space-y-4 border-b border-line p-5 lg:border-b-0 lg:border-r">
              <div className="text-sm font-semibold text-ink">Calling settings</div>
              <div className="space-y-1.5">
                <Label>Default caller ID</Label>
                <Select value={settings.caller_id} onValueChange={(v) => save({ ...settings, caller_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.numbers.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted">Numbers come from your {active.name} account.</p>
              </div>
              <div>
                <Label>Dialling mode</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1 text-xs">
                  {DIAL_MODES.map((m) => (
                    <button
                      key={m.key}
                      disabled={pending || (m.key === "power" && !active.capabilities.includes("power_dialer"))}
                      title={m.key === "power" && !active.capabilities.includes("power_dialer") ? `${active.name} doesn't support power dialling` : m.text}
                      onClick={() => save({ ...settings, dial_mode: m.key })}
                      className={cn(
                        "relative cursor-pointer rounded-lg px-2 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        settings.dial_mode === m.key ? "text-white" : "text-muted hover:text-ink",
                      )}
                    >
                      {settings.dial_mode === m.key && (
                        <motion.span layoutId="dial-mode" className="absolute inset-0 rounded-lg bg-brand-gradient" transition={{ duration: 0.2 }} />
                      )}
                      <span className="relative">{m.label}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted">{DIAL_MODES.find((m) => m.key === settings.dial_mode)?.text}</p>
              </div>
              {(
                [
                  { key: "record_calls", label: "Record calls", text: "Recordings are linked to the call and the lead.", cap: "call_recording" },
                  { key: "local_presence", label: "Local presence", text: "Use a caller ID from the lead's country.", cap: null },
                  { key: "auto_log_calls", label: "Auto-log calls", text: "Every call is saved to the lead's history.", cap: null },
                ] as const
              ).map((t) => (
                <label key={t.key} className="flex cursor-pointer items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm text-ink">{t.label}</span>
                    <span className="block text-xs text-muted">{t.text}</span>
                  </span>
                  <Switch
                    checked={settings[t.key]}
                    disabled={pending || (t.cap !== null && !active.capabilities.includes(t.cap))}
                    onCheckedChange={(v) => save({ ...settings, [t.key]: v })}
                  />
                </label>
              ))}
            </div>
            <div className="space-y-3 p-5">
              <div className="text-sm font-semibold text-ink">Connection</div>
              <div className="rounded-xl border border-line bg-canvas/60 p-3 text-xs">
                <div className="mb-2 flex items-center gap-1.5 font-medium text-ink">
                  <ShieldCheck className="h-4 w-4 text-brand-green-text" />
                  {active.auth === "oauth" ? "Authorised with OAuth" : "API credentials stored encrypted"}
                </div>
                <dl className="space-y-1">
                  {Object.entries(state.credentialsMasked).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-muted">{active.credentialFields.find((f) => f.key === k)?.label ?? k}</dt>
                      <dd className="font-mono text-ink">{v || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {active.capabilities.map((c) => (
                  <Badge key={c} variant="violet">
                    <Check className="h-3 w-3" /> {CAPABILITY_LABEL[c]}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted">{active.integrationNote}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Marketplace */}
      <Card>
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-display text-base font-semibold text-ink">Choose your dialer</h3>
          <p className="text-xs text-muted">
            Bring whichever calling subscription you already have. Switching providers doesn&rsquo;t change anything for agents: the same Call
            button and softphone keep working.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {DIALER_PROVIDERS.map((p, i) => {
            const isActive = active?.key === p.key;
            return (
              <motion.div
                key={p.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  "hover-lift flex flex-col rounded-2xl border bg-surface p-4",
                  isActive ? "border-transparent ring-2 ring-[var(--brand-green)]" : "border-line",
                )}
              >
                <div className="flex items-start gap-3">
                  <Tile p={p} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{p.name}</span>
                      {isActive && <Badge variant="confirm">Active</Badge>}
                    </div>
                    <div className="text-xs text-muted">{p.tagline}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.capabilities.slice(0, 4).map((c) => (
                    <span key={c} className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">
                      {CAPABILITY_LABEL[c]}
                    </span>
                  ))}
                  {p.capabilities.length > 4 && (
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">+{p.capabilities.length - 4}</span>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-muted hover:text-brand-blue">
                    API docs <ExternalLink className="h-3 w-3" />
                  </a>
                  {isActive ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-brand-green-text">
                      <Check className="h-3.5 w-3.5" /> In use
                    </span>
                  ) : (
                    <Button size="sm" variant={active ? "secondary" : "primary"} onClick={() => setConnecting(p)}>
                      {active ? (
                        <>
                          <ArrowLeftRight className="h-3.5 w-3.5" /> Switch
                        </>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </Card>

      {/* Developer preview */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
              <Code2 className="h-4 w-4 text-brand-blue" /> How it plugs in
            </h3>
            <p className="text-xs text-muted">
              What the CRM sends to each provider when an agent presses Call. In this demo it&rsquo;s prepared but not sent.
            </p>
          </div>
          <Select value={devProvider} onValueChange={setDevProvider}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIALER_PROVIDERS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-3 text-xs text-muted">
            <p className="text-sm text-ink">{devMeta?.integrationNote}</p>
            <ol className="space-y-2">
              <li>
                <span className="font-medium text-ink">1. One interface.</span> Every provider implements the same{" "}
                <code className="rounded bg-canvas px-1">DialerAdapter</code>: place a call, hang up, report status.
              </li>
              <li>
                <span className="font-medium text-ink">2. One switch.</span> The adapter for the connected provider is picked at runtime, so
                changing dialer is a settings change.
              </li>
              <li>
                <span className="font-medium text-ink">3. Events back in.</span> Provider webhooks (answered, ended, recording ready) update
                the call log and the lead.
              </li>
            </ol>
          </div>
          <pre className="max-h-72 overflow-auto rounded-xl bg-midnight p-4 text-[11px] leading-relaxed text-emerald-200">
            {preview
              ? preview.kind === "http"
                ? `${preview.method} ${preview.url}\n${Object.entries(preview.headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n")}\n\n${JSON.stringify(preview.body, null, 2)}`
                : `# Click-to-call link\n${preview.url}\n\n# ${preview.note}`
              : "—"}
          </pre>
        </div>
      </Card>

      <ConnectDialog provider={connecting} switching={Boolean(active)} onClose={() => setConnecting(null)} onConnected={() => router.refresh()} />
    </div>
  );
}

function ConnectDialog({
  provider,
  switching,
  onClose,
  onConnected,
}: {
  provider: DialerProviderMeta | null;
  switching: boolean;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit(oauth = false) {
    if (!provider) return;
    startTransition(async () => {
      const r = await connectDialer(provider.key, oauth ? {} : values);
      if (r.error) toast.error(r.error);
      else {
        toast.success(`${provider.name} connected — all calls now go through it`, { icon: <Phone className="h-4 w-4" /> });
        setValues({});
        onClose();
        onConnected();
      }
    });
  }

  return (
    <Dialog open={Boolean(provider)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <AnimatePresence mode="wait">
          {provider && (
            <motion.div key={provider.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Tile p={provider} size={36} />
                  {switching ? `Switch to ${provider.name}` : `Connect ${provider.name}`}
                </DialogTitle>
                <DialogDescription>
                  {switching
                    ? "Your current dialer will be replaced. Agents keep the same Call button and softphone."
                    : "Once connected, every Call button in the CRM places calls through this account."}
                </DialogDescription>
              </DialogHeader>

              {provider.auth === "oauth" ? (
                <div className="space-y-3">
                  <Button className="w-full" style={{ background: provider.color }} disabled={pending} onClick={() => submit(true)}>
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />} Sign in with {provider.name}
                  </Button>
                  <p className="text-center text-[11px] text-muted">
                    Demo: sign-in is simulated. Live, this opens {provider.name}&rsquo;s OAuth consent screen.
                  </p>
                </div>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  {provider.credentialFields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={`cred-${f.key}`}>{f.label}</Label>
                      <Input
                        id={`cred-${f.key}`}
                        type={f.secret ? "password" : "text"}
                        placeholder={f.placeholder ?? (f.secret ? "••••••••" : "")}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        autoComplete="off"
                      />
                      {f.help && <p className="text-[11px] text-muted">{f.help}</p>}
                    </div>
                  ))}
                  <p className="flex items-center gap-1.5 text-[11px] text-muted">
                    <KeyRound className="h-3.5 w-3.5" /> Demo: any values work. Only a masked hint is kept.
                  </p>
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {switching ? "Switch dialer" : "Connect"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
