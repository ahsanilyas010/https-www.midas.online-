"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { addLeadGenLead, type LeadGenResult } from "@/lib/actions/lead-gen";
import { countryToRegion } from "@/lib/campaign-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const initialState: LeadGenResult = {};
const NONE = "__none__";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add lead"}
    </Button>
  );
}

export function AddLeadDialog({
  campaigns,
  dataSources,
}: {
  campaigns: { id: string; name: string; country: string | null }[];
  dataSources: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addLeadGenLead, initialState);
  const [campaignId, setCampaignId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const router = useRouter();
  const campaign = campaigns.find((c) => c.id === campaignId);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      toast.success(state.note ?? "Lead added");
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-3.5 w-3.5" /> Add lead
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add lead</DialogTitle>
          <DialogDescription>
            The number is checked against the suppression list and existing leads. The lead enters unassigned and
            pending screening; a manager screens it before it can be dialled. Leave the phone blank to save a contact
            that still needs a number.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Campaign</Label>
              <Select value={campaignId || undefined} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="campaign_id" value={campaignId} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Data source (optional)</Label>
              <Select value={sourceId || undefined} onValueChange={(v) => setSourceId(v === NONE ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {dataSources.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="data_source_id" value={sourceId} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_first">First name</Label>
              <Input id="lg_first" name="first_name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_last">Last name</Label>
              <Input id="lg_last" name="last_name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_company">Company</Label>
              <Input id="lg_company" name="company_name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_title">Job title</Label>
              <Input id="lg_title" name="job_title" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_email">Email</Label>
              <Input id="lg_email" name="email" type="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_phone">Phone</Label>
              <Input id="lg_phone" name="phone" placeholder="+44 7700 900123" mono />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_country">Region</Label>
              <Input key={campaignId} id="lg_country" name="country" defaultValue={countryToRegion(campaign?.country)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_city">City</Label>
              <Input id="lg_city" name="city" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_state">State</Label>
              <Input id="lg_state" name="region" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lg_post">Postcode</Label>
              <Input id="lg_post" name="postcode" />
            </div>
          </div>

          {state.error && <p className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">{state.error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
