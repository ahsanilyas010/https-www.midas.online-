import { requireRole } from "@/lib/auth/current-profile";
import { createRealClient } from "@/lib/supabase/real";
import { Badge } from "@/components/ui/badge";
import { priorContact } from "@/lib/leads/prior-contact";
import { SCREENING_BADGE } from "@/lib/lead-status";
import { LeadDetailsDialog } from "@/app/(app)/admin/campaigns/[id]/lead-details-dialog";
import { BookMeetingDialog } from "@/components/zoom/book-meeting-dialog";
import { EditLeadDialog } from "./edit-lead-dialog";
import { PromoteContactDialog } from "./promote-contact-dialog";
import { LeadStatusSelect } from "./lead-status-select";

export default async function MyLeadsPage() {
  const profile = await requireRole(["agent"]);
  const supabase = await createRealClient();

  // The explicit assigned_to filter is the product rule (My leads = leads
  // assigned to me); RLS additionally limits an agent to their campaigns.
  const [{ data: leads }, { data: contacts }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", profile.workspace_id)
      .eq("assigned_to", profile.id)
      .order("updated_at", { ascending: false })
      .limit(500),
    // Contacts from an import or manual entry that have no phone number yet.
    supabase
      .from("unphoned_contacts")
      .select("*")
      .eq("workspace_id", profile.workspace_id)
      .eq("assigned_to", profile.id)
      .is("promoted_lead_id", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const rows = leads ?? [];
  const contactRows = contacts ?? [];

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink">My leads</h2>
        <p className="text-xs text-muted">
          {rows.length} lead{rows.length === 1 ? "" : "s"} assigned to you. Edits here save straight to the lead.
          Leads assigned to you are only ever dialed by you; the dial workspace serves them from your queue once they
          have passed screening.
        </p>
      </div>

      {contactRows.length > 0 && (
        <div className="mb-6">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-ink">Needs a phone number ({contactRows.length})</h3>
            <p className="text-xs text-muted">
              Add a number to move a contact into the lead list. It is checked against the suppression list first.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {contactRows.map((c) => (
                  <tr key={c.id} className="h-[38px] border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-medium text-ink">{c.full_name ?? "-"}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-muted">{c.company_name ?? "-"}</td>
                    <td className="max-w-[200px] truncate px-3 py-1.5 text-muted">{c.email ?? "-"}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <LeadDetailsDialog
                          leadName={c.full_name ?? "This contact"}
                          custom={c.custom as Record<string, unknown> | null}
                          contact={{ email: c.email, company_name: c.company_name, city: c.city }}
                        />
                        <PromoteContactDialog
                          contact={{
                            id: c.id,
                            full_name: c.full_name,
                            company_name: c.company_name,
                            country_hint: c.country_hint,
                          }}
                        />
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
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Disposition</th>
              <th className="px-3 py-2 font-medium">Remarks</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Screening</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const custom = { ...((l.custom as Record<string, unknown> | null) ?? {}) };
              const { disposition, remarks } = priorContact({ ...custom, agent_notes: l.agent_notes });
              const name = [l.first_name, l.last_name].filter(Boolean).join(" ") || l.full_name || l.company_name;
              return (
                <tr key={l.id} className="h-[38px] border-b border-line last:border-0">
                  <td className="px-3 py-1.5 font-medium text-ink">{name || "-"}</td>
                  <td className="px-3 py-1.5 tabular">{l.phone_e164}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-muted">{l.company_name ?? "-"}</td>
                  <td className="px-3 py-1.5">{disposition ? <Badge variant="warning">{disposition}</Badge> : "-"}</td>
                  <td className="max-w-[280px] truncate px-3 py-1.5 text-muted" title={remarks ?? undefined}>
                    {remarks ?? "-"}
                  </td>
                  <td className="px-3 py-1.5">
                    <LeadStatusSelect leadId={l.id} status={l.status} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant={SCREENING_BADGE[l.screening_status] ?? "neutral"}>{l.screening_status}</Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <LeadDetailsDialog
                        leadName={name || l.phone_e164 || "Lead"}
                        custom={{ ...custom, ...(l.agent_notes ? { agent_notes: l.agent_notes } : {}) }}
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
                      <BookMeetingDialog leadId={l.id} leadName={name || null} />
                      <EditLeadDialog lead={l} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
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
