"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Managers pick which client's report to view; the choice lives in the URL
// (?client=<id>) so it survives refresh and can be shared.
export function ClientSelector({ clients, current }: { clients: { id: string; name: string }[]; current: string }) {
  const router = useRouter();
  return (
    <Select value={current} onValueChange={(id) => router.push(`/portal?client=${id}`)}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Choose a client" />
      </SelectTrigger>
      <SelectContent>
        {clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
