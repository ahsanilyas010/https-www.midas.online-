"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Video, Loader2, Unplug, PlugZap, Film, Sparkles, DoorOpen, BellRing, CalendarPlus, PlayCircle, FileText } from "lucide-react";
import { setZoomConnection, updateZoomSettings, type ZoomIntegration, type ZoomSettings } from "@/lib/actions/zoom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const TOGGLES: { key: keyof Omit<ZoomSettings, "auto_recording">; label: string; text: string; icon: typeof Film }[] = [
  { key: "waiting_room", label: "Waiting room", text: "Guests wait until the agent admits them.", icon: DoorOpen },
  { key: "ai_companion", label: "AI Companion summaries", text: "Save Zoom's meeting summary back onto the lead.", icon: Sparkles },
  { key: "add_to_followups", label: "Add to follow-up tray", text: "Booked meetings appear as reminders for the agent.", icon: BellRing },
];

export function ZoomIntegrationCard({
  integration,
  meetingCount,
  endedCount,
}: {
  integration: ZoomIntegration;
  meetingCount: number;
  endedCount: number;
}) {
  const [settings, setSettings] = useState(integration.settings);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(next: ZoomSettings) {
    setSettings(next);
    startTransition(async () => {
      const r = await updateZoomSettings(next);
      if (r.error) toast.error(r.error);
      else toast.success("Zoom settings saved");
    });
  }

  function toggleConnection() {
    startTransition(async () => {
      const r = await setZoomConnection(!integration.connected);
      if (r.error) toast.error(r.error);
      else {
        toast.success(integration.connected ? "Zoom disconnected" : "Zoom connected");
        router.refresh();
      }
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0b5cff] via-[#2d6bff] to-[var(--violet)] p-5 text-white">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <motion.span
              animate={integration.connected ? { rotate: [0, -6, 6, 0] } : {}}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 4 }}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0b5cff] shadow-lg"
            >
              <Video className="h-6 w-6" />
            </motion.span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-semibold">Zoom</h3>
                {integration.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-medium text-emerald-100 ring-1 ring-emerald-300/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse-dot" /> Connected
                  </span>
                ) : (
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">Not connected</span>
                )}
              </div>
              <div className="text-sm text-white/80">
                {integration.connected
                  ? `${integration.accountName} · ${integration.accountEmail} · ${integration.plan}`
                  : "Book, start and record Zoom meetings from any lead."}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-white/15 text-white">Demo mode</Badge>
            <Button
              onClick={toggleConnection}
              disabled={pending}
              className={integration.connected ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[#0b5cff] hover:bg-white/90"}
              variant="secondary"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : integration.connected ? <Unplug className="h-4 w-4" /> : <PlugZap className="h-4 w-4" />}
              {integration.connected ? "Disconnect" : "Connect Zoom"}
            </Button>
          </div>
        </div>
        {integration.connected && (
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Meetings booked", value: meetingCount },
              { label: "Meetings held", value: endedCount },
              { label: "Connected since", value: integration.connectedAt ? new Date(integration.connectedAt).toLocaleDateString() : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 px-2 py-2 ring-1 ring-white/15">
                <div className="font-display text-lg font-semibold tabular">{s.value}</div>
                <div className="text-[11px] text-white/70">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        <div className="space-y-4 border-b border-line p-5 lg:border-b-0 lg:border-r">
          <div className="text-sm font-semibold text-ink">Meeting defaults</div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-sm text-ink">
              <Film className="h-4 w-4 text-brand-blue" /> Automatic recording
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1 text-xs">
              {(["cloud", "local", "none"] as const).map((v) => (
                <button
                  key={v}
                  disabled={!integration.connected || pending}
                  onClick={() => save({ ...settings, auto_recording: v })}
                  className={`relative cursor-pointer rounded-lg px-2 py-1.5 font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${settings.auto_recording === v ? "text-white" : "text-muted hover:text-ink"}`}
                >
                  {settings.auto_recording === v && (
                    <motion.span layoutId="rec-mode" className="absolute inset-0 rounded-lg bg-[#0b5cff]" transition={{ duration: 0.2 }} />
                  )}
                  <span className="relative">{v === "none" ? "Off" : v}</span>
                </button>
              ))}
            </div>
          </div>
          {TOGGLES.map(({ key, label, text, icon: Icon }) => (
            <label key={key} className="flex cursor-pointer items-start justify-between gap-3">
              <span>
                <span className="flex items-center gap-1.5 text-sm text-ink">
                  <Icon className="h-4 w-4 text-brand-blue" /> {label}
                </span>
                <span className="block text-xs text-muted">{text}</span>
              </span>
              <Switch
                checked={settings[key]}
                disabled={!integration.connected || pending}
                onCheckedChange={(v) => save({ ...settings, [key]: v })}
              />
            </label>
          ))}
        </div>

        <div className="space-y-4 p-5">
          <div className="text-sm font-semibold text-ink">What the integration does</div>
          <ul className="space-y-3 text-xs text-muted">
            <li className="flex gap-2">
              <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-gold-text" />
              <span>
                <span className="font-medium text-ink">Book from the call.</span> Agents schedule a Zoom meeting from the dial
                workspace. It is linked to the lead and campaign and lands in their follow-up tray.
              </span>
            </li>
            <li className="flex gap-2">
              <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold-text" />
              <span>
                <span className="font-medium text-ink">Start in one click.</span> “Start” opens the meeting room with the lead
                (a simulated Zoom room in this demo), including recording, screen share and captions.
              </span>
            </li>
            <li className="flex gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold-text" />
              <span>
                <span className="font-medium text-ink">Outcome comes back.</span> When a meeting ends, the cloud recording and an
                AI Companion summary are saved on the meeting for managers and the client to review.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
