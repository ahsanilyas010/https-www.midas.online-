"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRIES, NEW_CLIENT, TIMEZONES, VERTICALS, toTimeInput } from "@/lib/campaign-options";

export interface CampaignFormValues {
  name: string;
  code: string | null;
  client_id: string | null;
  country: string | null;
  audience: string;
  vertical: string | null;
  timezone: string;
  caller_id: string | null;
  calling_window_start: string | null;
  calling_window_end: string | null;
  max_attempts: number;
  cooling_off_hours: number;
  recording_enabled: boolean;
  disclosure_script: string | null;
  objection_notes: string | null;
  status?: string;
}

const NONE = "__none__";

// A <Select> that posts its value under `name` via a hidden input, so the
// server action can read it from FormData like any other field.
function Field({
  id,
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  error,
}: {
  id: string;
  label: string;
  // Shown with a star, and the field is outlined with the message below it.
  required?: boolean;
  error?: string | null;
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </Label>
      <Select value={value || undefined} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={error ? "border-danger ring-1 ring-danger" : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={name} value={value} />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function CampaignFormFields({
  idPrefix,
  clients,
  initial,
  showStatus,
  error,
  allowNewClient,
}: {
  idPrefix: string;
  // Offer "+ Create a new client" in the client list (the new-campaign form).
  allowNewClient?: boolean;
  clients: { id: string; name: string }[];
  initial?: CampaignFormValues;
  showStatus?: boolean;
  // The server's message; it is attached to the client or country field when it is about one of them.
  error?: string | null;
}) {
  const clientError = error && /client/i.test(error) ? error : null;
  const countryError = error && /country/i.test(error) ? error : null;
  const [clientId, setClientId] = useState(initial?.client_id ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [audience, setAudience] = useState(initial?.audience ?? "B2C");
  const [vertical, setVertical] = useState(initial?.vertical ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone ?? "UTC");
  const [callerId, setCallerId] = useState(initial?.caller_id ?? "");
  const [status, setStatus] = useState(initial?.status ?? "paused");

  const verticalOptions = [...VERTICALS];
  if (initial?.vertical && !verticalOptions.some((v) => v.value === initial.vertical)) {
    verticalOptions.push({ value: initial.vertical, label: initial.vertical });
  }
  const countryOptions = [...COUNTRIES];
  if (initial?.country && !countryOptions.some((c) => c.value === initial.country)) {
    countryOptions.push({ value: initial.country, label: initial.country });
  }
  const tzOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}name`}>Campaign name</Label>
          <Input id={`${idPrefix}name`} name="name" defaultValue={initial?.name ?? ""} placeholder="Construction - UK" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}code`}>Code</Label>
          <Input id={`${idPrefix}code`} name="code" defaultValue={initial?.code ?? ""} placeholder="CONST-UK" mono />
        </div>
      </div>

      <Field
        id={`${idPrefix}client`}
        label="Client"
        name="client_id"
        value={clientId}
        onChange={setClientId}
        options={[
          ...clients.map((c) => ({ value: c.id, label: c.name })),
          ...(allowNewClient ? [{ value: NEW_CLIENT, label: "+ Create a new client..." }] : []),
        ]}
        placeholder={clients.length === 0 && allowNewClient ? "Create a new client" : "Select client"}
        required
        error={clientError && !clientId ? clientError : null}
      />
      {allowNewClient && clientId === NEW_CLIENT && (
        <div className="-mt-1 grid grid-cols-2 gap-3 rounded-lg border border-line bg-canvas p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}new_client_name`}>
              New client name<span className="text-danger"> *</span>
            </Label>
            <Input id={`${idPrefix}new_client_name`} name="new_client_name" placeholder="Acme Ltd" maxLength={120} required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}new_client_email`}>Contact email (optional)</Label>
            <Input id={`${idPrefix}new_client_email`} name="new_client_email" type="email" placeholder="contact@client.com" maxLength={200} />
          </div>
          <p className="col-span-2 text-[11px] text-muted">
            The client is created with this campaign. Add its contact person, country and DPA details later under Campaigns.
          </p>
        </div>
      )}
      {clients.length === 0 && !allowNewClient && (
        <p className="-mt-2 text-[11px] text-warning">No clients yet. Add one on the Campaigns page first.</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field
          id={`${idPrefix}country`}
          label="Country"
          name="country"
          value={country}
          onChange={setCountry}
          options={countryOptions}
          placeholder="Select"
          required
          error={countryError && !country ? countryError : null}
        />
        <Field
          id={`${idPrefix}audience`}
          label="Audience"
          name="audience"
          value={audience}
          onChange={setAudience}
          options={[
            { value: "B2C", label: "B2C" },
            { value: "B2B", label: "B2B" },
          ]}
        />
        <Field
          id={`${idPrefix}vertical`}
          label="Vertical"
          name="vertical"
          value={vertical}
          onChange={setVertical}
          options={verticalOptions}
          placeholder="Select"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          id={`${idPrefix}timezone`}
          label="Timezone"
          name="timezone"
          value={timezone}
          onChange={setTimezone}
          options={tzOptions.map((t) => ({ value: t, label: t }))}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}caller`}>Caller ID (optional)</Label>
          <Input
            id={`${idPrefix}caller`}
            name="caller_id"
            value={callerId}
            onChange={(e) => setCallerId(e.target.value)}
            placeholder="+14155550123"
            inputMode="tel"
            maxLength={32}
          />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-muted">
        Caller ID must be an E.164 number that is on your Zoom Phone plan (a number on your Zoom Phone plan). Leave blank
        to use the agent&apos;s default Zoom caller ID.
      </p>

      <div className="grid grid-cols-4 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}ws`}>Window start</Label>
          <Input id={`${idPrefix}ws`} name="calling_window_start" type="time" defaultValue={toTimeInput(initial?.calling_window_start)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}we`}>Window end</Label>
          <Input id={`${idPrefix}we`} name="calling_window_end" type="time" defaultValue={toTimeInput(initial?.calling_window_end)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}max`}>Max attempts</Label>
          <Input id={`${idPrefix}max`} name="max_attempts" type="number" min={1} max={50} defaultValue={initial?.max_attempts ?? 6} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}cool`}>Cooling-off (h)</Label>
          <Input id={`${idPrefix}cool`} name="cooling_off_hours" type="number" min={0} max={720} defaultValue={initial?.cooling_off_hours ?? 24} />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-muted">
        Leads are only served to agents inside the calling window (campaign timezone), under the attempt cap and after
        the cooling-off period. Leave the window blank for no time restriction.
      </p>

      <p className="text-[11px] text-muted">Call recording is managed in your Zoom Phone account, not here.</p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}disc`}>Disclosure script</Label>
        <Textarea
          id={`${idPrefix}disc`}
          name="disclosure_script"
          rows={3}
          defaultValue={initial?.disclosure_script ?? ""}
          placeholder="Read at the start of each call, e.g. recording / identity disclosure."
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}obj`}>Objection notes</Label>
        <Textarea id={`${idPrefix}obj`} name="objection_notes" rows={3} defaultValue={initial?.objection_notes ?? ""} />
      </div>

      {showStatus && (
        <Field
          id={`${idPrefix}status`}
          label="Status"
          name="status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active (dialable)" },
            { value: "paused", label: "Paused" },
            { value: "archived", label: "Archived" },
          ]}
        />
      )}
    </div>
  );
}
