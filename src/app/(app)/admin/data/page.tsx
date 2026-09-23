import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/current-profile";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateDataSourceDialog } from "../campaigns/[id]/create-data-source-dialog";
import { RegisterConnectorDialog } from "./register-connector-dialog";
import { RunFetchDialog } from "./run-fetch-dialog";
import { VendorCsvDialog } from "./vendor-csv-dialog";

interface DataSourceConfig {
  connector_key?: string;
}

export default async function DataPage() {
  const profile = await requireProfile();
  if (!["super_admin", "ops_manager", "team_lead"].includes(profile.role)) redirect("/");

  const supabase = await createClient();
  const [
    { data: dataSources },
    { data: campaigns },
    { data: fetchRuns },
    { data: performance },
    { data: agents },
    { data: teams },
  ] = await Promise.all([
    supabase.from("data_sources").select("*").order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id, name, code, market").order("name"),
    supabase
      .from("source_fetch_runs")
      .select(
        "*, data_sources(name), campaigns(name, code), profiles!source_fetch_runs_triggered_by_fkey(full_name), assignee:profiles!source_fetch_runs_assigned_to_fkey(full_name), assigned_team:teams(name)",
      )
      .order("started_at", { ascending: false })
      .limit(30),
    supabase.from("v_source_performance").select("*").order("leads_loaded", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, team_id")
      .eq("role", "agent")
      .eq("is_active", true)
      .order("full_name"),
    supabase.from("teams").select("id, name").order("name"),
  ]);

  const connectorSources = (dataSources ?? []).filter(
    (d) => (d.config as DataSourceConfig | null)?.connector_key,
  );
  const plainSources = (dataSources ?? []).filter(
    (d) => !(d.config as DataSourceConfig | null)?.connector_key,
  );

  return (
    <div className="p-4">
      <Tabs defaultValue="sources">
        <TabsList className="mb-4">
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="history">Fetch history</TabsTrigger>
          <TabsTrigger value="performance">Source performance</TabsTrigger>
        </TabsList>

        <TabsContent value="sources">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {(dataSources ?? []).length} sources · every lead traces back to one, with a lawful
              basis on file
            </p>
            <div className="flex gap-2">
              <RegisterConnectorDialog />
              <VendorCsvDialog
                campaigns={campaigns ?? []}
                dataSources={plainSources.map((d) => ({ id: d.id, name: d.name }))}
                agents={agents ?? []}
                teams={teams ?? []}
              />
              <CreateDataSourceDialog />
            </div>
          </div>

          <div className="mb-3">
            <p className="mb-2 text-xs font-medium text-ink">Connector-backed</p>
            {connectorSources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line bg-white p-6 text-center text-sm text-muted">
                No connectors registered yet — register Companies House, UK planning or US permits
                above.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Connector</th>
                      <th className="px-3 py-2 font-medium">Market</th>
                      <th className="px-3 py-2 font-medium">Lawful basis</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {connectorSources.map((d) => (
                      <tr key={d.id} className="h-[38px] border-b border-line last:border-0">
                        <td className="px-3 py-1.5 font-medium text-ink">{d.name}</td>
                        <td className="px-3 py-1.5 tabular text-xs text-muted">
                          {(d.config as DataSourceConfig).connector_key}
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge variant="neutral">{d.market ?? "—"}</Badge>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted">
                          {d.lawful_basis.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <RunFetchDialog
                            dataSourceId={d.id}
                            connectorKey={(d.config as DataSourceConfig).connector_key!}
                            campaigns={campaigns ?? []}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-ink">Other sources</p>
            <div className="overflow-hidden rounded-lg border border-line bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Lawful basis</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {plainSources.map((d) => (
                    <tr key={d.id} className="h-[38px] border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">{d.name}</td>
                      <td className="px-3 py-1.5 text-xs text-muted">
                        {d.source_type.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted">
                        {d.lawful_basis.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-1.5">
                        {d.is_active ? (
                          <Badge variant="confirm">Active</Badge>
                        ) : (
                          <Badge variant="neutral">Inactive</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {plainSources.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted">
                        No manually-registered sources yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <p className="mb-3 text-xs text-muted">Last 30 fetch/import runs, across every source.</p>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium">Triggered by</th>
                  <th className="px-3 py-2 font-medium">Assigned</th>
                  <th className="px-3 py-2 font-medium">Found</th>
                  <th className="px-3 py-2 font-medium">Imported</th>
                  <th className="px-3 py-2 font-medium">Rejected</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {(fetchRuns ?? []).map((r) => {
                  const run = r as typeof r & {
                    data_sources?: { name: string } | null;
                    campaigns?: { name: string; code: string } | null;
                    profiles?: { full_name: string } | null;
                    assignee?: { full_name: string } | null;
                    assigned_team?: { name: string } | null;
                  };
                  return (
                    <tr key={r.id} className="h-[38px] border-b border-line last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">
                        {run.data_sources?.name ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted">{run.campaigns?.code ?? "—"}</td>
                      <td className="px-3 py-1.5 text-xs text-muted">
                        {run.profiles?.full_name ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {run.assignee?.full_name ? (
                          <Badge variant="confirm">{run.assignee.full_name}</Badge>
                        ) : run.assigned_team?.name ? (
                          <Badge variant="confirm">{run.assigned_team.name} (team)</Badge>
                        ) : (
                          <span className="text-muted">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 tabular text-muted">{r.records_found}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r.records_imported}</td>
                      <td className="px-3 py-1.5 tabular text-muted">{r.records_rejected}</td>
                      <td className="px-3 py-1.5">
                        {r.status === "complete" && <Badge variant="confirm">Complete</Badge>}
                        {r.status === "running" && <Badge variant="warning">Running</Badge>}
                        {r.status === "failed" && <Badge variant="danger">Failed</Badge>}
                      </td>
                      <td className="px-3 py-1.5 tabular text-xs text-muted">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {(fetchRuns ?? []).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted">
                      No fetch runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <p className="mb-3 text-xs text-muted">
            Per source, from first import to conversion. A source with a high load count but few
            passes screening is worth revisiting before the next fetch.
          </p>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Loaded</th>
                  <th className="px-3 py-2 font-medium">Screened</th>
                  <th className="px-3 py-2 font-medium">Suppressed</th>
                  <th className="px-3 py-2 font-medium">Worked</th>
                  <th className="px-3 py-2 font-medium">Contacted</th>
                  <th className="px-3 py-2 font-medium">Converted</th>
                  <th className="px-3 py-2 font-medium">Last fetch</th>
                </tr>
              </thead>
              <tbody>
                {(performance ?? []).map((p) => (
                  <tr key={p.data_source_id} className="h-[38px] border-b border-line last:border-0">
                    <td className="px-3 py-1.5 font-medium text-ink">{p.name}</td>
                    <td className="px-3 py-1.5 tabular text-muted">{p.leads_loaded}</td>
                    <td className="px-3 py-1.5 tabular text-muted">{p.screened_passed}</td>
                    <td className="px-3 py-1.5 tabular text-muted">{p.suppressed}</td>
                    <td className="px-3 py-1.5 tabular text-muted">{p.worked}</td>
                    <td className="px-3 py-1.5 tabular text-muted">{p.contacted}</td>
                    <td className="px-3 py-1.5 tabular text-muted">{p.converted}</td>
                    <td className="px-3 py-1.5 tabular text-xs text-muted">
                      {p.last_fetched_at ? new Date(p.last_fetched_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {(performance ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                      No sources yet.
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
