"use client";

import { useEffect, useState, useTransition } from "react";
import { Download, EyeOff, Eye } from "lucide-react";
import { getClientPortalData, generateMonthlyReport, getReportDownloadUrl, type ClientPortalData } from "@/lib/actions/client-portal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function PortalClient({ initialData }: { initialData: ClientPortalData }) {
  const [data, setData] = useState(initialData);
  const [anonymize, setAnonymize] = useState(true);
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const next = await getClientPortalData(anonymize);
      setData(next);
    });
  }, [anonymize]);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    const gen = await generateMonthlyReport();
    if (gen.error || !gen.path) {
      setDownloadError(gen.error ?? "Could not generate the report.");
      setDownloading(false);
      return;
    }
    const link = await getReportDownloadUrl(gen.path);
    if (link.error || !link.url) {
      setDownloadError(link.error ?? "Could not create a download link.");
      setDownloading(false);
      return;
    }
    window.open(link.url, "_blank");
    setDownloading(false);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Your campaigns</h1>
        <Button variant="secondary" onClick={handleDownload} disabled={downloading}>
          <Download className="h-4 w-4" /> {downloading ? "Preparing..." : "Download monthly PDF"}
        </Button>
      </div>
      {downloadError && <p className="text-sm text-danger">{downloadError}</p>}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Funnel</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Loaded</th>
                <th className="px-4 py-3">Screened</th>
                <th className="px-4 py-3">Dialled</th>
                <th className="px-4 py-3">Connected</th>
                <th className="px-4 py-3">Converted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.funnel.map((f) => (
                <tr key={f.campaign_id}>
                  <td className="px-4 py-3 font-medium text-ink">{f.campaign_name}</td>
                  <td className="px-4 py-3">{f.loaded}</td>
                  <td className="px-4 py-3">{f.screened}</td>
                  <td className="px-4 py-3">{f.dialled}</td>
                  <td className="px-4 py-3">{f.connected}</td>
                  <td className="px-4 py-3">{f.converted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Outcomes</h2>
        <Card>
          <CardContent className="flex flex-col gap-1.5 py-4">
            {data.outcomes.map((o) => (
              <div key={o.disposition_label} className="flex items-center justify-between text-sm">
                <span className="text-ink">{o.disposition_label}</span>
                <span className="text-muted">{o.count}</span>
              </div>
            ))}
            {data.outcomes.length === 0 && <p className="text-sm text-muted">No calls yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Agent activity</h2>
          <button onClick={() => setAnonymize((a) => !a)} className="flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline">
            {anonymize ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {anonymize ? "Show names" : "Anonymise"}
          </button>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-1.5 py-4">
            {pending && <p className="text-xs text-muted">Refreshing...</p>}
            {data.activity.map((a) => (
              <div key={a.agent_label} className="flex items-center justify-between text-sm">
                <span className="text-ink">{a.agent_label}</span>
                <span className="text-muted">
                  {a.calls} calls · {a.connects} connects · {a.conversions} conversions
                </span>
              </div>
            ))}
            {data.activity.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
