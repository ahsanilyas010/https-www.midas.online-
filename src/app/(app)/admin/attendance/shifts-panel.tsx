"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { assignShift, deleteShift, unassignShift } from "@/lib/actions/attendance-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ShiftView {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  timezone: string;
  grace_minutes: number;
  days_of_week: number[];
  assignments: { id: string; user_id: string; name: string }[];
}

export function ShiftCard({ shift, people }: { shift: ShiftView; people: { id: string; full_name: string }[] }) {
  const [userId, setUserId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ error?: string }>, ok: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        toast.success(ok);
        setUserId("");
        router.refresh();
      }
    });
  }

  const assigned = new Set(shift.assignments.map((a) => a.user_id));
  const crossesMidnight = shift.end_time <= shift.start_time;

  return (
    <Card className="animate-slide-up">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {shift.name}
          <span className="flex items-center gap-1.5">
            {crossesMidnight && <Badge variant="neutral">Overnight</Badge>}
            <Button
              size="icon"
              variant="secondary"
              disabled={pending}
              aria-label="Delete shift"
              onClick={() => {
                if (confirm("Delete this shift and its assignments?")) run(() => deleteShift(shift.id), "Shift deleted");
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted">
        <div className="tabular">
          {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} {shift.timezone}
        </div>
        <div>
          {shift.days_of_week.map((d) => DAYS[d]).join(", ")} · {shift.grace_minutes}m grace
        </div>
        <div className="flex flex-wrap gap-1">
          {shift.assignments.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-ink">
              {a.name}
              <button
                type="button"
                aria-label={`Unassign ${a.name}`}
                disabled={pending}
                onClick={() => run(() => unassignShift(a.id), "Unassigned")}
              >
                <X className="h-3 w-3 text-muted" />
              </button>
            </span>
          ))}
          {shift.assignments.length === 0 && <span>No one assigned.</span>}
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Assign agent…" />
            </SelectTrigger>
            <SelectContent>
              {people
                .filter((p) => !assigned.has(p.id))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="secondary"
            disabled={!userId || pending}
            aria-label="Assign"
            onClick={() => run(() => assignShift(userId, shift.id, new Date().toISOString().slice(0, 10)), "Assigned")}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
