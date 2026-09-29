"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createEmailTemplate, approveEmailTemplate, type EmailActionState } from "@/lib/actions/email-v2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RealTables } from "@/lib/supabase/real-types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Create template"}
    </Button>
  );
}

export function EmailTemplatesClient({ templates }: { templates: RealTables<"email_templates">[] }) {
  const [state, action] = useActionState<EmailActionState, FormData>(createEmailTemplate, {});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                <td className="px-4 py-3 text-muted">{t.subject}</td>
                <td className="px-4 py-3">{t.approved ? "Approved" : "Pending"}</td>
                <td className="px-4 py-3">
                  {!t.approved && (
                    <button
                      disabled={pending}
                      onClick={() => startTransition(async () => { await approveEmailTemplate(t.id); router.refresh(); })}
                      className="text-xs font-semibold text-brand-blue hover:underline"
                    >
                      Approve
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No templates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-ink">New template</h2>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Follow-up after callback" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" required placeholder="Following up, {{lead_name}}" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body_md">Body</Label>
            <Textarea id="body_md" name="body_md" required rows={6} placeholder={"Hi {{lead_name}},\n\nThanks for your time today..."} />
            <p className="text-xs text-muted">Merge fields: {"{{lead_name}}"}, {"{{agent_name}}"}. An unsubscribe link is added automatically.</p>
          </div>
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
