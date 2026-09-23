"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ClientSelector({
  clients,
  current,
}: {
  clients: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("client");
    } else {
      params.set("client", value);
    }
    const qs = params.toString();
    router.push(qs ? `/client?${qs}` : "/client");
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="w-64">
        <SelectValue placeholder="All clients" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All clients (aggregate)</SelectItem>
        {clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
