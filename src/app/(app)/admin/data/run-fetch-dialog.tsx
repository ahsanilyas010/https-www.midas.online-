"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, PlayCircle } from "lucide-react";
import { runConnectorFetch } from "@/lib/actions/data-sources";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const CONNECTOR_PARAM_HINTS: Record<string, string> = {
  companies_house: '{ "query": "roofing contractors bristol", "itemsPerPage": 20 }',
  uk_planning_planit: '{ "authority": "bristol", "recentMonths": 1, "pageSize": 20 }',
  us_permits_socrata:
    '{ "config": { "domain": "data.cityofchicago.org", "datasetId": "ydr8-5enu", "fieldMap": { "externalRef": "permit_", "phone": "contact_1_phone", "addressLine1": "street_number" } }, "limit": 100 }',
};

export function RunFetchDialog({
  dataSourceId,
  connectorKey,
  campaigns,
}: {
  dataSourceId: string;
  connectorKey: string;
  campaigns: { id: string; name: string; code: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [paramsText, setParamsText] = useState(CONNECTOR_PARAM_HINTS[connectorKey] ?? "{}");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    let fetchParams: Record<string, unknown>;
    try {
      fetchParams = JSON.parse(paramsText);
    } catch {
      toast.error("Params must be valid JSON.");
      return;
    }
    if (!campaignId) {
      toast.error("Pick a campaign.");
      return;
    }

    startTransition(async () => {
      const result = await runConnectorFetch({ connectorKey, dataSourceId, campaignId, fetchParams });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Fetch complete — ${result.imported} imported, ${result.rejected} rejected.`);
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <PlayCircle className="h-3.5 w-3.5" /> Run fetch
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run connector fetch</DialogTitle>
          <DialogDescription>
            Fetches, normalises, suppression-screens and commits records into the chosen campaign —
            same pipeline as every other import path.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Campaign</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Params (JSON)</Label>
            <Textarea
              value={paramsText}
              onChange={(e) => setParamsText(e.target.value)}
              rows={5}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !campaignId}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run fetch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
