import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddLeadDialog } from "./add-lead-dialog";
import { LeadRowActions } from "./lead-row-actions";
import { AutoAssignButton } from "./auto-assign-button";
import { SendEmailButton } from "./send-email-button";
import { CreateTemplateDialog } from "./create-template-dialog";
import { ManageAgentsDialog } from "./manage-agents-dialog";
import { ActivateToggle } from "./activate-toggle";
import { LeadDetailsDialog } from "./lead-details-dialog";

const SCREENING_BADGE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  passed: "confirm",
  unscreened: "danger",
  blocked: "danger",
  expired: "warning",
  pending: "warning",
};

function customStr(custom: unknown, key: string): string | null {
  const v = (custom as Record<string, unknown> | null)?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager"].includes(profile.role)) redirect("/");

  const supabase = await createClient();
  const [
    { data: campaign },
    { data: leads },
    { data: dataSources },
    { data: agents },
    { data: templates },
    { data: agentRoster },
  ] = await Promise.all([
    supabase.from("campaigns").select("*, clients(name)").eq("id", id).single(),
    supabase
      .from("leads")
      .select("*, profiles(full_name)")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("data_sources").select("*").eq("is_active", true).order("name"),
    supabase
      .from("campaign_assignments")
      .select("user_id, daily_target, profiles(full_name)")
      .eq("campaign_id", id),
    supabase
      .from("email_templates")
      .select("*")
      .or(`campaign_id.is.null,campaign_id.eq.${id}`)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("role", "agent").eq("is_active", true).order("full_name"),
  ]);

  if (!campaign) notFound();

  const templateOptions = (templates ?? []).map((t) => ({ id: t.id, name: t.name }));
  const assignedAgents = (agents ?? []).map((a) => ({
    id: a.user_id,
    name: (a as { profiles?: { full_name: string } | null }).profiles?.full_name ?? "—",
    dailyTarget: a.daily_target,
  }));

  return (
    <div className="p-4">
      <Link
        href="/admin/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All campaigns
      </Link>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            {campaign.name}
            <Badge variant="blue">{campaign.market}</Badge>
            {campaign.is_active ? (
              <Badge variant="confirm">Live</Badge>
            ) : (
              <Badge variant="neutral">Not activated</Badge>
            )}
          </h2>
          <p className="tabular text-xs text-muted">
            {campaign.code} · {(campaign as { clients?: { name: string } | null }).clients?.name} ·{" "}
            {(agents ?? []).length} agents assigned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ManageAgentsDialog campaignId={campaign.id} assigned={assignedAgents} roster={agentRoster ?? []} />
          <ActivateToggle campaignId={campaign.id} isActive={campaign.is_active} />
        </div>
      </div>

      <Tabs defaultValue="leads">
        <TabsList className="mb-3">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="templates">Email templates</TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          <div className="mb-3 flex justify-end gap-2">
            <AutoAssignButton campaignId={campaign.id} />
            <AddLeadDialog
              campaignId={campaign.id}
              campaignMarket={campaign.market}
              dataSources={dataSources ?? []}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 font-medium">Authority</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Application type</th>
                  <th className="px-3 py-2 font-medium">Application date</th>
                  <th className="px-3 py-2 font-medium">Proposal</th>
                  <th className="px-3 py-2 font-medium">Architect Name</th>
                  <th className="px-3 py-2 font-medium">Web</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Decision date</th>
                  <th className="px-3 py-2 font-medium">Comments</th>
                  <th className="px-3 py-2 font-medium">Disposition</th>
                  <th className="px-3 py-2 font-medium">Assigned to</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Screening</th>
                  <th className="px-3 py-2 font-medium">Attempts</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(leads ?? []).map((l) => {
                  const custom = l.custom as Record<string, unknown> | null;
                  const address = [l.address_line1, l.city, l.region, l.postcode].filter(Boolean).join(", ");
                  const proposal = customStr(custom, "proposal");
                  const comments = customStr(custom, "comments");
                  const web = customStr(custom, "web");
                  const disposition = customStr(custom, "prior_disposition");
                  return (
                    <tr key={l.id} className="h-[38px] border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">
                        {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-3 py-1.5 tabular">{l.phone_e164}</td>
                      <td className="max-w-[200px] truncate px-3 py-1.5 text-muted" title={address || undefined}>
                        {address || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-muted">{customStr(custom, "authority") ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted">{customStr(custom, "category") ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted">{customStr(custom, "application_type") ?? "—"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">
                        {customStr(custom, "application_date") ?? "—"}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-1.5 text-muted" title={proposal ?? undefined}>
                        {proposal ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-muted">{customStr(custom, "architect_name") ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted">
                        {web ? (
                          <a
                            href={web.startsWith("http") ? web : `https://${web}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-blue hover:underline"
                          >
                            Link
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-muted">{customStr(custom, "contact") ?? "—"}</td>
                      <td className="px-3 py-1.5 tabular text-muted">
                        {customStr(custom, "decision_date") ?? "—"}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-1.5 text-muted" title={comments ?? undefined}>
                        {comments ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {disposition ? <Badge variant="warning">{disposition}</Badge> : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-muted">
                        {(l as { profiles?: { full_name: string } | null }).profiles?.full_name ?? (
                          <span className="text-warning">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {l.do_not_call ? (
                          <Badge variant="danger">Suppressed</Badge>
                        ) : (
                          <Badge variant="neutral">{l.status.replace(/_/g, " ")}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <Badge variant={SCREENING_BADGE[l.screening_status] ?? "neutral"}>
                          {l.screening_status}
                        </Badge>
                      </td>
                      <td className="px-3 py-1.5 tabular text-muted">
                        {l.attempt_count} / {campaign.max_attempts}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-1">
                          <LeadDetailsDialog
                            leadName={[l.first_name, l.last_name].filter(Boolean).join(" ") || l.phone_e164}
                            custom={custom}
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
                          <SendEmailButton leadId={l.id} hasEmail={Boolean(l.email)} templates={templateOptions} />
                          <LeadRowActions
                            leadId={l.id}
                            screeningStatus={l.screening_status}
                            doNotCall={l.do_not_call}
                            assignedTo={l.assigned_to}
                            agents={(agents ?? []).map((a) => ({
                              id: a.user_id,
                              name:
                                (a as { profiles?: { full_name: string } | null }).profiles?.full_name ?? "—",
                            }))}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(leads ?? []).length === 0 && (
                  <tr>
                    <td colSpan={19} className="px-3 py-8 text-center text-sm text-muted">
                      No leads yet. Add one, or wait for the bulk import wizard (Phase 7).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] text-muted">
            Every lead here passed the internal suppression check at entry. Screening still needs
            to be marked passed, then assigned to an agent (individually or via Auto-assign),
            before it becomes dialable in that agent&rsquo;s workspace.
          </p>
        </TabsContent>

        <TabsContent value="templates">
          <div className="mb-3 flex justify-end">
            <CreateTemplateDialog campaignId={campaign.id} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(templates ?? []).map((t) => (
              <Card key={t.id} className="animate-slide-up">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>{t.name}</CardTitle>
                  {t.approved_at ? (
                    <Badge variant="confirm">Approved</Badge>
                  ) : (
                    <Badge variant="warning">Pending approval</Badge>
                  )}
                </CardHeader>
                <CardContent className="text-xs text-muted">
                  <div className="mb-1 font-medium text-ink">{t.subject}</div>
                  <div className="line-clamp-3">{t.body_html.replace(/<[^>]+>/g, " ")}</div>
                </CardContent>
              </Card>
            ))}
            {(templates ?? []).length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-muted">
                No templates yet. Agents can only send approved templates — never free-form mail.
              </div>
            )}
          </div>
          {!process.env.RESEND_API_KEY && (
            <p className="mt-3 rounded-md bg-warning-tint px-3 py-2 text-xs text-warning">
              RESEND_API_KEY isn&rsquo;t set — sends are logged to email_sends but won&rsquo;t
              actually deliver until it is.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
