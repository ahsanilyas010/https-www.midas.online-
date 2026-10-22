"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { saveLeadField } from "@/lib/actions/my-leads";
import { submitDisposition } from "@/lib/actions/dial-workspace";
import type { RealTables } from "@/lib/supabase/real-types";
import {
  cardSubline,
  cardTags,
  cardTitle,
  companySearchUrl,
  customEntries,
  fmtDateTime,
  localInputToIso,
  websiteHref,
  type Bucket,
  type SheetItem,
} from "@/lib/callsheet/derive";
import type { ActiveCall } from "@/components/zoom-phone/zoom-phone-provider";
import { EditLeadDialog } from "./edit-lead-dialog";
import { PromoteContactDialog } from "./promote-contact-dialog";
import { LeadStatusSelect } from "./lead-status-select";

type Disposition = RealTables<"dispositions">;

// One editable text row in "More information": shows the value (or the
// design's "[add notes]" placeholder) and turns into a small editor on click.
function InlineField({
  label,
  field,
  leadId,
  value,
  placeholder,
  multiline,
  onSaved,
}: {
  label: string;
  field: "agent_notes" | "next_step";
  leadId: string;
  value: string | null;
  placeholder: string;
  multiline?: boolean;
  onSaved: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await saveLeadField(leadId, field, draft);
      if (res.error) {
        setError(res.error);
        return;
      }
      onSaved(draft.trim() || null);
      setEditing(false);
    });
  }

  return (
    <>
      <dt>{label}</dt>
      <dd className={!editing && !value ? "ph" : undefined}>
        {editing ? (
          <div className="field-edit">
            {multiline ? (
              <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} autoFocus />
            ) : (
              <input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={label} autoFocus />
            )}
            {error && <span role="alert">{error}</span>}
            <span className="row-btns">
              <button type="button" className="btn primary" onClick={save} disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </button>
              <button type="button" className="btn" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </button>
            </span>
          </div>
        ) : value ? (
          <button type="button" className="val-btn" onClick={() => (setDraft(value), setEditing(true))} aria-label={`Edit ${label.toLowerCase()}`}>
            {value}
          </button>
        ) : (
          <button type="button" className="ph-btn" onClick={() => (setDraft(""), setEditing(true))}>
            {placeholder}
          </button>
        )}
      </dd>
    </>
  );
}

function OutcomePanel({
  item,
  dispositions,
  tz,
  onSaved,
  onCancel,
}: {
  item: SheetItem;
  dispositions: Disposition[];
  tz: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [cb, setCb] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const chosen = dispositions.find((d) => d.code === code) ?? null;

  function save() {
    if (!chosen) return setError("Pick an outcome.");
    if (chosen.requires_note && !notes.trim()) return setError("This outcome needs a note.");
    let callbackDueAt: string | undefined;
    if (chosen.requires_followup) {
      const iso = cb ? localInputToIso(cb, tz) : null;
      if (!iso) return setError("Choose when to call back.");
      callbackDueAt = iso;
    }
    setError(null);
    start(async () => {
      const res = await submitDisposition({ leadId: item.id, dispositionCode: chosen.code, notes: notes.trim() || undefined, callbackDueAt });
      if (res.error) return setError(res.error);
      onSaved();
    });
  }

  return (
    <div className="outcome">
      <h3>Log call outcome</h3>
      <div className="outcome-chips" role="group" aria-label="Outcome">
        {dispositions.map((d) => (
          <button key={d.code} type="button" aria-pressed={code === d.code} onClick={() => setCode(d.code)}>
            {d.label}
          </button>
        ))}
      </div>
      <label htmlFor={`oc-notes-${item.id}`}>Notes{chosen?.requires_note ? " (required)" : ""}</label>
      <textarea id={`oc-notes-${item.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {chosen?.requires_followup && (
        <>
          <label htmlFor={`oc-cb-${item.id}`}>Call back at ({tz})</label>
          <input id={`oc-cb-${item.id}`} type="datetime-local" value={cb} onChange={(e) => setCb(e.target.value)} />
        </>
      )}
      {error && (
        <span role="alert" style={{ color: "var(--cs-od-fg)", fontSize: 13 }}>
          {error}
        </span>
      )}
      <span className="row-btns">
        <button type="button" className="btn primary" onClick={save} disabled={pending || !code}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Saving" /> : "Save outcome"}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </span>
    </div>
  );
}

export function LeadCard({
  item,
  n,
  bucket,
  tz,
  now,
  dispositions,
  activeCall,
  isActive,
  dialBusy,
  anyCallLive,
  onDial,
  onPatch,
  onOutcomeSaved,
  onCloseOutcome,
}: {
  item: SheetItem;
  n: number;
  bucket: Bucket;
  tz: string;
  now: number;
  dispositions: Disposition[];
  activeCall: ActiveCall | null;
  isActive: boolean;
  dialBusy: boolean;
  anyCallLive: boolean;
  onDial: (item: SheetItem) => void;
  onPatch: (id: string, patch: Partial<SheetItem>) => void;
  onOutcomeSaved: (id: string) => void;
  onCloseOutcome: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [logging, setLogging] = useState(false);
  const showOutcome = isActive || logging;
  const isContact = item.kind === "contact";
  const title = cardTitle(item);
  const sub = cardSubline(item);
  const tags = cardTags(item, bucket, tz, now);
  const site = websiteHref(item.website);
  const extras = customEntries(item.custom);
  const blocked = item.dial_block_reason;

  const callState = isActive && activeCall ? activeCall.state : null;
  const dialLabel =
    dialBusy
      ? "Starting..."
      : callState === "dialing"
        ? "Dialing..."
        : callState === "ringing"
          ? "Ringing..."
          : callState === "connected"
            ? "Connected"
            : callState === "ended"
              ? "Call again"
              : "Dial";

  return (
    <article className={`card${bucket === "overdue" ? " overdue" : ""}${isActive && callState && callState !== "ended" ? " live" : ""}`} aria-label={title}>
      <div className="top">
        <div className="num" aria-hidden>
          {n}
        </div>
        <div>
          <div className="name">{title}</div>
          {sub && <div className="meta">{sub}</div>}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="tags">
          {tags.map((t, i) => (
            <span key={i} className={`tag${t.tone === "plain" ? "" : ` ${t.tone}`}`}>
              {t.text}
            </span>
          ))}
        </div>
      )}

      <div className="links">
        {item.email && (
          <a className="lk" href={`mailto:${item.email}`}>
            Email
          </a>
        )}
        <a
          className="lk"
          href={companySearchUrl(item)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            window.open(companySearchUrl(item), "callsheet_popup", "popup=yes,width=1000,height=760,left=120,top=60,noopener");
          }}
        >
          Search company
        </a>
        {site && (
          <a className="lk" href={site} target="_blank" rel="noopener noreferrer">
            Website
          </a>
        )}
      </div>

      <details className="more" open={open || showOutcome} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>More information</summary>
        <dl className="dl">
          {item.email && (
            <>
              <dt>Email</dt>
              <dd>{item.email}</dd>
            </>
          )}
          {item.phone_e164 && (
            <>
              <dt>Phone</dt>
              <dd>{item.phone_e164}</dd>
            </>
          )}
          {item.website && (
            <>
              <dt>Website</dt>
              <dd>{item.website}</dd>
            </>
          )}
          {item.appointment_at && (
            <>
              <dt>Appointment</dt>
              <dd>{fmtDateTime(item.appointment_at, tz)}</dd>
            </>
          )}
          {!isContact && (
            <>
              <InlineField
                label="Notes"
                field="agent_notes"
                leadId={item.id}
                value={item.agent_notes}
                placeholder="[add notes]"
                multiline
                onSaved={(v) => onPatch(item.id, { agent_notes: v ?? "" })}
              />
              <InlineField
                label="Next step"
                field="next_step"
                leadId={item.id}
                value={item.next_step}
                placeholder="[add next step]"
                onSaved={(v) => onPatch(item.id, { next_step: v ?? "" })}
              />
              <dt>Outcome</dt>
              <dd className={item.last_outcome_label || showOutcome ? undefined : "ph"}>
                {item.last_outcome_label ? `${item.last_outcome_label}${item.last_outcome_notes ? ` · ${item.last_outcome_notes}` : ""} ` : null}
                {!showOutcome && (
                  <button type="button" className="ph-btn" onClick={() => setLogging(true)}>
                    {item.last_outcome_label ? "log another" : "[log call outcome]"}
                  </button>
                )}
              </dd>
              <dt>Status</dt>
              <dd>
                <LeadStatusSelect leadId={item.id} status={item.status} />
              </dd>
            </>
          )}
          {extras.map((e) => (
            <div key={e.key} style={{ display: "contents" }}>
              <dt title={e.key}>{e.label}</dt>
              <dd title={e.full.length > e.value.length ? e.full : undefined}>{e.value}</dd>
            </div>
          ))}
        </dl>
        {!isContact && (
          <div style={{ marginTop: 6 }}>
            <EditLeadDialog trigger="link" timezone={tz} lead={item} />
          </div>
        )}
        {showOutcome && !isContact && (
          <OutcomePanel
            item={item}
            dispositions={dispositions}
            tz={tz}
            onSaved={() => {
              setLogging(false);
              onOutcomeSaved(item.id);
            }}
            onCancel={() => {
              setLogging(false);
              if (isActive) onCloseOutcome();
            }}
          />
        )}
      </details>

      {isContact ? (
        <PromoteContactDialog
          contact={{ id: item.id, full_name: item.full_name, company_name: item.company_name, country_hint: item.country_hint ?? "" }}
        />
      ) : item.phone_e164 ? (
        <>
          <button
            type="button"
            className="dial"
            onClick={() => onDial(item)}
            disabled={!!blocked || dialBusy || (anyCallLive && !(isActive && callState === "ended"))}
            aria-label={blocked ? `Can't dial ${title}: ${blocked}` : `Dial ${title}`}
          >
            <b>{item.phone_display ?? item.phone_e164}</b>
            <i>{blocked ? "On hold" : dialLabel}</i>
          </button>
          {blocked && <p className="dial-why">{blocked}</p>}
        </>
      ) : null}
    </article>
  );
}
