"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { assignShift } from "@/lib/actions/attendance";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AssignShiftDialog({
  shiftId,
  people,
}: {
  shiftId: string;
  people: { id: string; full_name: string }[];
}) {
  const [userId, setUserId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-1.5 pt-1">
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue placeholder="Assign agent…" />
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
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
        onClick={() =>
          startTransition(async () => {
            const today = new Date().toISOString().slice(0, 10);
            const result = await assignShift(userId, shiftId, today);
            if (result.error) {
              toast.error(result.error);
            } else {
              toast.success("Assigned");
              setUserId("");
              router.refresh();
            }
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
