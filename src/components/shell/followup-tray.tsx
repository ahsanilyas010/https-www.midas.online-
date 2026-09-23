"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Check, AlarmClock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getMyFollowups, snoozeFollowup, completeFollowup, cancelFollowup, type FollowupRow } from "@/lib/actions/followups";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function FollowupTray({ userId, initial }: { userId: string; initial: FollowupRow[] }) {
  const [followups, setFollowups] = useState(initial);
  const router = useRouter();

  async function refresh() {
    setFollowups(await getMyFollowups());
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`followups-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "followups", filter: `assigned_to=eq.${userId}` },
        () => {
          refresh();
        },
      )
      .subscribe();

    const interval = setInterval(refresh, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [userId]);

  const dueNow = followups.filter((f) => new Date(f.due_at) <= new Date());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {dueNow.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-semibold text-ink animate-pulse-dot">
              {dueNow.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
        <div className="border-b border-line px-3 py-2 text-xs font-medium text-muted">
          Follow-ups due
        </div>
        <div className="max-h-80 overflow-y-auto">
          {followups.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted">Nothing due. Clear queue.</p>
          )}
          {followups.map((f) => {
            const due = new Date(f.due_at) <= new Date();
            return (
              <div key={f.id} className="flex flex-col gap-1.5 border-b border-line px-3 py-2 last:border-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink">
                    {[f.leads?.first_name, f.leads?.last_name].filter(Boolean).join(" ") ||
                      f.leads?.phone_e164}
                  </span>
                  <Badge variant={due ? "accent" : "neutral"}>
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(f.due_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                  </Badge>
                </div>
                {f.note && <p className="text-[11px] text-muted">{f.note}</p>}
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const r = await completeFollowup(f.id);
                      if (r.error) toast.error(r.error);
                      else {
                        toast.success("Done");
                        refresh();
                        router.refresh();
                      }
                    }}
                  >
                    <Check className="h-3 w-3" /> Done
                  </Button>
                  {f.snooze_count < 2 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const r = await snoozeFollowup(f.id);
                        if (r.error) toast.error(r.error);
                        else {
                          toast.success("Snoozed 15 min");
                          refresh();
                        }
                      }}
                    >
                      <AlarmClock className="h-3 w-3" /> Snooze
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const r = await cancelFollowup(f.id);
                      if (r.error) toast.error(r.error);
                      else {
                        refresh();
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
