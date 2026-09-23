import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateCampaignDialog } from "./create-campaign-dialog";
import { CreateClientDialog } from "./create-client-dialog";
import { EditClientDialog } from "./edit-client-dialog";
import { BRAND } from "@/lib/brand";

export default async function CampaignsPage() {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager"].includes(profile.role)) redirect("/");

  const supabase = await createClient();
  const [{ data: campaigns }, { data: clients }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, clients(name)")
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("*").order("name"),
  ]);

  return (
    <div className="p-4">
      <Tabs defaultValue="campaigns">
        <div className="mb-4 flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="campaigns">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-muted">
              {campaigns?.length ?? 0} campaigns · never mix markets in one campaign
            </p>
            <CreateCampaignDialog clients={clients ?? []} />
          </div>

          {(campaigns ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-white p-10 text-center">
              <p className="text-sm text-muted">
                No campaigns yet. Create the first one — e.g.{" "}
                <code className="tabular">CONST-UK</code> and{" "}
                <code className="tabular">CONST-US</code> as two separate campaigns for the
                construction client.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(campaigns ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/campaigns/${c.id}`}
                  className="animate-slide-up block rounded-lg border border-line bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-ink">{c.name}</div>
                      <div className="tabular text-xs text-muted">{c.code}</div>
                    </div>
                    {c.is_active ? (
                      <Badge variant="confirm">Live</Badge>
                    ) : (
                      <Badge variant="neutral">Not activated</Badge>
                    )}
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Badge variant="blue">{c.market}</Badge>
                    <Badge variant="neutral">{c.audience}</Badge>
                    <Badge variant="neutral">{c.vertical.replace(/_/g, " ")}</Badge>
                    {c.risk_tier === "high" && <Badge variant="danger">High risk</Badge>}
                    {c.risk_tier === "elevated" && <Badge variant="warning">Elevated risk</Badge>}
                  </div>
                  <div className="space-y-1 text-xs text-muted">
                    <div>
                      Client: {(c as { clients?: { name: string } | null }).clients?.name ?? "—"}
                    </div>
                    <div>
                      Screening: {c.requires_tps_screening && "TPS "}
                      {c.requires_ctps_screening && "CTPS "}
                      {c.requires_us_dnc_screening && "US DNC "}
                      {!c.requires_tps_screening &&
                      !c.requires_ctps_screening &&
                      !c.requires_us_dnc_screening
                        ? "None required"
                        : `· expires after ${c.screening_max_age_days}d`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-muted">{clients?.length ?? 0} clients</p>
            <CreateClientDialog />
          </div>

          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Country</th>
                  <th className="px-3 py-2 font-medium">Contact email</th>
                  <th className="px-3 py-2 font-medium">Controller</th>
                  <th className="px-3 py-2 font-medium">DPA signed</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(clients ?? []).map((c) => (
                  <tr key={c.id} className="h-[38px] border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-medium text-ink">{c.name}</td>
                    <td className="px-3 py-1.5 text-muted">{c.country ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted">
                      {c.contact_email ?? <span className="text-warning">Not set</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {c.is_data_controller ? (
                        <Badge variant="blue">Client</Badge>
                      ) : (
                        <Badge variant="neutral">{BRAND.processorBadgeLabel}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-muted">
                      {c.dpa_signed_on ?? (
                        <span className="text-warning">Not on file</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <EditClientDialog client={c} />
                    </td>
                  </tr>
                ))}
                {(clients ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                      No clients yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
