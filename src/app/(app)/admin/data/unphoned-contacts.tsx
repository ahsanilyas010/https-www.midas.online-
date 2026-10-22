"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignUnphonedContact, promoteContact, type ActionResult } from "@/lib/actions/data-sources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableWrap } from "@/components/ui/data-table";

export interface UnphonedRow {
  id: string;
  full_name: string | null;
  email: string | null;
  source: string;
  assigned_to: string | null;
  promoted: boolean;
}

const initialState: ActionResult = {};

function PromoteForm({ contactId }: { contactId: string }) {
  const [state, action, pending] = useActionState(promoteContact, initialState);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      toast.success("Promoted to a lead (pending screening).");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="contact_id" value={contactId} />
      <Input name="phone" placeholder="+44 7700 900123" className="h-8 w-40 text-xs" required />
      <Button type="submit" size="sm" disabled={pending}>
        Promote
      </Button>
    </form>
  );
}

export function UnphonedContacts({
  rows,
  agents,
  canManage,
}: {
  rows: UnphonedRow[];
  agents: { id: string; full_name: string }[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const nameOf = new Map(agents.map((a) => [a.id, a.full_name]));

  function assign(id: string, agentId: string) {
    startTransition(async () => {
      const r = await assignUnphonedContact(id, agentId || null);
      if (r.error) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <TableWrap label="Phone-less contacts">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Assigned to</th>
            <th className="px-3 py-2 font-medium">Add phone</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="px-3 py-1.5 font-medium text-ink">{r.full_name ?? "—"}</td>
              <td className="px-3 py-1.5 text-xs text-muted">{r.email ?? "—"}</td>
              <td className="px-3 py-1.5 text-xs text-muted">{r.source}</td>
              <td className="px-3 py-1.5 text-xs">
                {canManage && !r.promoted ? (
                  <select
                    className="h-8 rounded-md border border-line bg-white pl-2 text-xs"
                    disabled={pending}
                    value={r.assigned_to ?? ""}
                    onChange={(e) => assign(r.id, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-muted">{r.assigned_to ? nameOf.get(r.assigned_to) ?? "—" : "Unassigned"}</span>
                )}
              </td>
              <td className="px-3 py-1.5">
                {r.promoted ? <Badge variant="confirm">Promoted</Badge> : <PromoteForm contactId={r.id} />}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                No phone-less contacts. They appear here when an imported file has rows with a name or email but no number.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableWrap>
  );
}
