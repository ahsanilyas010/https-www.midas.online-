import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { priorContact } from "@/lib/leads/prior-contact";
import { LeadDetailsDialog } from "@/app/(app)/admin/campaigns/[id]/lead-details-dialog";
import { EditLeadDialog } from "./edit-lead-dialog";
import { PromoteContactDialog } from "./promote-contact-dialog";

export default async function MyLeadsPage() {
  const profile = await requireProfile();
  if (profile.role !== "agent") redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS (leads_select) already scopes this to leads assigned to the caller
  // — the explicit filter here is just for query efficiency, not security.
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("assigned_to", user.id)
    .order("updated_at", { ascending: false })
    .limit(500);

  const rows = leads ?? [];

  // Contacts from an import that had no phone number at all — not dialable
  // until an agent or manager sources one. RLS (unphoned_contacts_select)
  // scopes this to the caller's own assigned, not-yet-promoted rows.
  const { data: contacts } = await supabase
    .from("unphoned_contacts")
    .select("*")
    .eq("assigned_to", user.id)
    .is("promoted_lead_id", null)
    .order("created_at", { ascending: false })
    .limit(500);

  const contactRows = contacts ?? [];

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">My leads</h2>
        <p className="text-xs text-muted">
          {rows.length} lead{rows.length === 1 ? "" : "s"} assigned to you. Edits here save
          straight to the lead — the dial workspace still pulls from the shared campaign queue.
        </p>
      </div>

      {contactRows.length > 0 && (
        <div className="mb-6">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-ink">
              Needs a phone number ({contactRows.length})
            </h3>
            <p className="text-xs text-muted">
              From a contacts export with no phone on file. Add one to move a contact into your
              dial queue.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {contactRows.map((c) => (
                  <tr key={c.id} className="h-[38px] border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-medium text-ink">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-3 py-1.5 text-muted">{c.role ?? "—"}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-muted">
                      {c.project_title ?? "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-1.5 text-muted">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <LeadDetailsDialog
                          leadName={[c.first_name, c.last_name].filter(Boolean).join(" ") || "This contact"}
                          custom={c.custom as Record<string, unknown> | null}
                        />
                        <PromoteContactDialog contact={c} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Disposition</th>
              <th className="px-3 py-2 font-medium">Remarks</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const custom = (l.custom as Record<string, unknown> | null) ?? {};
              const { disposition, remarks } = priorContact(l.custom);
              return (
                <tr key={l.id} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-3 py-1.5 font-medium text-ink">
                    {[l.first_name, l.last_name].filter(Boolean).join(" ") || l.company_name || "—"}
                  </td>
                  <td className="px-3 py-1.5 tabular">{l.phone_e164}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-muted">
                    {typeof custom.project_type === "string" ? custom.project_type : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {disposition ? <Badge variant="warning">{disposition}</Badge> : "—"}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-1.5 text-muted" title={remarks ?? undefined}>
                    {remarks ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    {l.do_not_call ? (
                      <Badge variant="danger">Suppressed</Badge>
                    ) : (
                      <Badge variant="neutral">{l.status.replace(/_/g, " ")}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <LeadDetailsDialog
                        leadName={[l.first_name, l.last_name].filter(Boolean).join(" ") || l.phone_e164}
                        custom={l.custom as Record<string, unknown> | null}
                        contact={{
                          email: l.email,
                          company_name: l.company_name,
                          job_title: l.job_title,
                          address_line1: l.address_line1,
                          city: l.city,
                          region: l.region,
                          postcode: l.postcode,
                        }}
                      />
                      <EditLeadDialog lead={l} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                  No leads assigned to you yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
