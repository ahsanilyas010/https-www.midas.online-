"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Headset, Loader2, Upload } from "lucide-react";
import { previewLeadImport, runLeadImport, type ImportResponse } from "@/lib/actions/lead-import";
import { screenLeadBatch } from "@/lib/actions/lead-upload";
import { RegisterSourceDialog } from "@/components/leads/register-source-dialog";
import {
  FIELD_LABELS,
  IMPORT_LIMITS,
  OPTIONAL_FIELDS,
  OPTIONAL_HINTS,
  OPTIONAL_LABELS,
  TARGET_FIELDS,
  normalizeHeaders,
  suggestMapping,
  validateMapping,
  type ColumnMapping,
  type FirstRowsPreview,
  type ImportPreview,
  type OptionalField,
  type TargetField,
} from "@/lib/leads/mapped-import-shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/format";
import { TableWrap } from "@/components/ui/data-table";

interface CampaignOption {
  id: string;
  name: string;
  country: string | null;
}

interface Props {
  campaigns: CampaignOption[];
  // Every import names a data source (the lawful basis the list is held
  // under). `needsReview` marks the auto-created legacy source, which cannot be
  // used until its real basis is set under Data.
  dataSources: { id: string; name: string; needsReview?: boolean }[];
  // Managers (super_admin / ops_manager) get the dial-it-myself and
  // screen-now options. Lead gen never sees them.
  isManager: boolean;
  onFinished?: () => void;
}

// One field's selection in the mapping step. "" = not chosen yet.
type Pick = string; // "" | "col:<header>" | "none" | "combine"
const emptyOpt = (): Record<OptionalField, Pick> => ({
  contact: "",
  website: "",
  campaign: "",
  notes: "",
  nextStep: "",
  appointment: "",
  lastContact: "",
});
const selectCls =
  "h-9 w-full rounded-md border border-line bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-blue";

const HINTS: Record<TargetField, string> = {
  name: "Who you are calling. If the file has first and last name in separate columns, combine them.",
  phone: "Required. Numbers are cleaned to international format using the campaign's country.",
  company: "The company or organisation the person works for.",
  email: "Used for follow-up emails. Rows with an email that doesn't look right keep the lead but leave the email empty.",
};

async function readHead(file: File): Promise<FirstRowsPreview> {
  // Dynamic import: the spreadsheet parser is only downloaded when someone
  // actually picks a file. Only the header and the first rows are read here;
  // the server parses the whole file.
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, sheetRows: 7 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = sheet
    ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: false })
    : [];
  if (aoa.length === 0) return { headers: [], rows: [] };
  const width = Math.max(...aoa.map((r) => r.length));
  const headers = normalizeHeaders(Array.from({ length: width }, (_, i) => aoa[0][i]));
  const rows = aoa.slice(1, 6).map((r) => headers.map((_, i) => (r[i] === null || r[i] === undefined ? "" : String(r[i]).trim())));
  return { headers, rows };
}

function toPick(p: { column: string } | { none: true } | { first: string; last: string } | undefined): Pick {
  if (!p) return "";
  if ("column" in p) return `col:${p.column}`;
  if ("none" in p) return "none";
  return "combine";
}

export function LeadImporter({ campaigns, dataSources, isManager, onFinished }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [head, setHead] = useState<FirstRowsPreview | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [dataSourceId, setDataSourceId] = useState("");
  const [picks, setPicks] = useState<Record<TargetField, Pick>>({ name: "", phone: "", company: "", email: "" });
  const [suggested, setSuggested] = useState<Record<TargetField, Pick>>({ name: "", phone: "", company: "", email: "" });
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [opt, setOpt] = useState<Record<OptionalField, Pick>>(emptyOpt());
  const [optSuggested, setOptSuggested] = useState<Record<OptionalField, Pick>>(emptyOpt());
  const [keepExtra, setKeepExtra] = useState(true);
  const [fallback, setFallback] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [callMyself, setCallMyself] = useState(false);
  const [screenNow, setScreenNow] = useState(false);
  const [done, setDone] = useState<Extract<ImportResponse, { ok: true }> | null>(null);
  const [screenedLater, setScreenedLater] = useState(0);
  const [pending, startTransition] = useTransition();

  const campaign = campaigns.find((c) => c.id === campaignId);

  const mapping: ColumnMapping = useMemo(() => {
    const m: ColumnMapping = {};
    const colOf = (p: Pick) => (p.startsWith("col:") ? p.slice(4) : "");
    if (picks.phone.startsWith("col:")) m.phone = { column: colOf(picks.phone) };
    if (picks.name === "none") m.name = { none: true };
    else if (picks.name === "combine") m.name = first && last ? { first, last } : undefined;
    else if (picks.name.startsWith("col:")) m.name = { column: colOf(picks.name) };
    for (const f of ["company", "email"] as const) {
      if (picks[f] === "none") m[f] = { none: true };
      else if (picks[f].startsWith("col:")) m[f] = { column: colOf(picks[f]) };
    }
    for (const f of OPTIONAL_FIELDS) {
      if (opt[f].startsWith("col:")) m[f] = { column: colOf(opt[f]) };
    }
    m.keepExtra = keepExtra;
    m.fallbackToDefault = fallback;
    return m;
  }, [picks, first, last, opt, keepExtra, fallback]);

  const check = useMemo(() => (head ? validateMapping(head.headers, mapping) : null), [head, mapping]);
  // "combine" with a column still missing is reported by validateMapping as an
  // unset name; make the message specific.
  const errors = { ...(check?.errors ?? {}) };
  if (picks.name === "combine" && (!first || !last)) errors.name = "Choose both the first-name and the last-name column.";

  const sampleLabels = {
    contact: "Contact person",
    website: "Website",
    campaign: "Campaign",
    notes: "Notes",
    nextStep: "Next step",
    appointment: "Appointment",
    lastContact: "Last contact",
  } as const;
  const sampleExtras = (Object.keys(sampleLabels) as (keyof typeof sampleLabels)[]).filter((k) =>
    k === "campaign" ? opt.campaign !== "" : (preview?.sample ?? []).some((r) => r[k]),
  );

  function makeForm() {
    const fd = new FormData();
    if (file) fd.set("file", file);
    fd.set("campaign_id", campaignId);
    fd.set("mapping", JSON.stringify(mapping));
    fd.set("data_source_id", dataSourceId);
    return fd;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    await handleFile(e.target.files?.[0] ?? null);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped.length === 0) return;
    if (fileRef.current) fileRef.current.files = dropped;
    void handleFile(dropped[0]);
  }

  async function handleFile(f: File | null) {
    setError(null);
    setHead(null);
    setFile(null);
    if (!f) return;
    if (f.size > IMPORT_LIMITS.maxBytes) {
      setError("That file is larger than 10 MB. Split it into smaller files and import them one at a time.");
      return;
    }
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
      setError("Upload a .csv or .xlsx file.");
      return;
    }
    try {
      const h = await readHead(f);
      if (h.headers.length === 0 || h.rows.length === 0) {
        setError("That file has no data rows. Check you picked the right file.");
        return;
      }
      setFile(f);
      setHead(h);
      const s = suggestMapping(h.headers);
      const sp: Record<TargetField, Pick> = {
        name: toPick(s.name),
        phone: toPick(s.phone),
        company: toPick(s.company),
        email: toPick(s.email),
      };
      setPicks(sp);
      setSuggested(sp);
      const so = emptyOpt();
      for (const f of OPTIONAL_FIELDS) so[f] = toPick(s[f] as { column: string } | undefined);
      setOpt(so);
      setOptSuggested(so);
      setKeepExtra(true);
      setFallback(false);
      if (s.name && "first" in s.name) {
        setFirst(s.name.first);
        setLast(s.name.last);
      } else {
        setFirst("");
        setLast("");
      }
      setTouched(false);
    } catch {
      setError("Couldn't read that file. Check it is a real .csv or .xlsx file.");
    }
  }

  function toMapping() {
    setError(null);
    if (!file || !head) return setError("Choose a file first.");
    if (!campaignId) return setError("Choose the campaign these leads belong to.");
    if (!dataSourceId) return setError("Choose the data source this list came from.");
    setTouched(false);
    setStep(2);
  }

  function toReview() {
    setTouched(true);
    setError(null);
    if (Object.keys(errors).length > 0) return;
    startTransition(async () => {
      const res = await previewLeadImport(makeForm());
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
      setStep(3);
    });
  }

  function doImport() {
    setError(null);
    const fd = makeForm();
    if (isManager && callMyself) fd.set("call_myself", "1");
    if (isManager && screenNow) fd.set("screen_now", "1");
    startTransition(async () => {
      const res = await runLeadImport(fd);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDone(res);
      setStep(4);
      toast.success(`Imported ${res.result.imported} lead${res.result.imported === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  function screenAfter() {
    if (!done) return;
    startTransition(async () => {
      const res = await screenLeadBatch(done.result.batchId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setScreenedLater(res.screenedCount ?? 0);
      toast.success(`Screened ${res.screenedCount ?? 0} lead(s).`);
      router.refresh();
    });
  }

  function reset() {
    setStep(1);
    setFile(null);
    setHead(null);
    setPreview(null);
    setDone(null);
    setScreenedLater(0);
    setCallMyself(false);
    setScreenNow(false);
    setError(null);
    setPicks({ name: "", phone: "", company: "", email: "" });
    setSuggested({ name: "", phone: "", company: "", email: "" });
    setOpt(emptyOpt());
    setOptSuggested(emptyOpt());
    if (fileRef.current) fileRef.current.value = "";
  }

  const steps = ["File", "Match columns", "Review", "Done"];

  return (
    <div className="flex flex-col gap-4" data-testid="lead-importer">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {steps.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
              step === i + 1
                ? "border-brand-blue bg-brand-blue-tint font-semibold text-brand-blue"
                : step > i + 1
                  ? "border-line bg-white text-ink"
                  : "border-line bg-canvas text-muted"
            }`}
            aria-current={step === i + 1 ? "step" : undefined}
          >
            <span className="font-semibold">{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Choose a CSV or Excel file of the people to call and the campaign they belong to. Up to 10 MB and 20,000 rows.
            Nothing is saved until you press Import on the review step.
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              Lead file (.csv or .xlsx) <span aria-hidden className="text-danger">*</span>
            </span>
            <label
              htmlFor="li-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-blue ${
                dragging ? "border-brand-blue bg-brand-blue-tint/40" : "border-line bg-canvas hover:border-brand-blue"
              }`}
            >
              <Upload className="h-5 w-5 text-muted" aria-hidden />
              {file ? (
                <span className="font-medium text-ink">
                  {file.name} <span className="font-normal text-muted">({(file.size / 1024).toFixed(0)} KB) ready</span>
                </span>
              ) : (
                <span className="text-ink">
                  <span className="font-medium text-brand-blue">Choose a file</span> or drop it here
                </span>
              )}
              <span className="text-xs text-muted">{file ? "Choose another to replace it" : "CSV or Excel, up to 10 MB"}</span>
              <input id="li-file" ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={onFile} className="sr-only" />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="li-campaign" className="text-sm font-medium text-ink">
              Campaign
            </label>
            <select id="li-campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectCls}>
              <option value="">Choose a campaign...</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">
              {campaign
                ? `Local-format phone numbers are read as ${campaign.country ?? "GB"} numbers.`
                : "The campaign's country decides how numbers without a country code are read."}
              {campaigns.length === 0 && " You have no campaigns yet: create one first under Campaigns."}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-end justify-between gap-2">
              <label htmlFor="li-source" className="text-sm font-medium text-ink">
                Data source <span aria-hidden className="text-danger">*</span>
              </label>
              <RegisterSourceDialog
                label="Register a new source"
                variant="secondary"
                onCreated={(id) => setDataSourceId(id)}
              />
            </div>
            <select
              id="li-source"
              value={dataSourceId}
              onChange={(e) => setDataSourceId(e.target.value)}
              className={selectCls}
              aria-required="true"
            >
              <option value="">Choose a data source...</option>
              {dataSources.map((d) => (
                <option key={d.id} value={d.id} disabled={d.needsReview}>
                  {d.needsReview ? `${d.name} (set its lawful basis under Data first)` : d.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">
              A source records where the list came from and the lawful basis it is held under. Every import needs one.
              {dataSources.filter((d) => !d.needsReview).length === 0 && " You don't have a usable source yet: register one above."}
            </p>
          </div>
          <div>
            <Button onClick={toMapping} disabled={!file || !campaignId || !dataSourceId}>
              Next: match columns
            </Button>
          </div>
        </section>
      )}

      {step === 2 && head && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Tell us which column in your file holds each of the four things we store about a lead. We made a first guess from the
            column names: please check each one. If the file doesn&apos;t have a field, say so.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {TARGET_FIELDS.map((f) => {
              const err = touched ? errors[f] : undefined;
              const isSuggested = picks[f] !== "" && picks[f] === suggested[f] && picks[f] !== "none";
              return (
                <div key={f} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-3">
                  <label htmlFor={`li-map-${f}`} className="text-sm font-semibold text-ink">
                    {FIELD_LABELS[f]}
                    <span className="ml-1 text-xs font-normal text-muted">{f === "phone" ? "(required)" : ""}</span>
                  </label>
                  <select
                    id={`li-map-${f}`}
                    value={picks[f]}
                    onChange={(e) => setPicks((p) => ({ ...p, [f]: e.target.value }))}
                    className={selectCls}
                    aria-invalid={Boolean(err)}
                  >
                    <option value="">Choose a column...</option>
                    {head.headers.map((h) => (
                      <option key={h} value={`col:${h}`}>
                        {h}
                      </option>
                    ))}
                    {f === "name" && <option value="combine">Combine first and last name (two columns)</option>}
                    {f !== "phone" && <option value="none">This file has no {FIELD_LABELS[f].toLowerCase()}</option>}
                  </select>
                  {f === "name" && picks.name === "combine" && (
                    <div className="grid grid-cols-2 gap-2">
                      <select aria-label="First name column" value={first} onChange={(e) => setFirst(e.target.value)} className={selectCls}>
                        <option value="">First name column...</option>
                        {head.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <select aria-label="Last name column" value={last} onChange={(e) => setLast(e.target.value)} className={selectCls}>
                        <option value="">Last name column...</option>
                        {head.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="text-xs text-muted">
                    {isSuggested ? "Suggested from the column name: check it's right. " : ""}
                    {HINTS[f]}
                  </p>
                  {err && <p className="text-xs font-medium text-danger">{err}</p>}
                </div>
              );
            })}
          </div>

          <details className="rounded-lg border border-line bg-white p-3" open={OPTIONAL_FIELDS.some((f) => opt[f] !== "")}>
            <summary className="cursor-pointer text-sm font-semibold text-ink">More details you can bring in (optional)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {OPTIONAL_FIELDS.map((f) => {
                const err = touched ? (errors as Record<string, string | undefined>)[f] : undefined;
                return (
                  <div key={f} className="flex flex-col gap-1.5">
                    <label htmlFor={`li-opt-${f}`} className="text-sm font-medium text-ink">
                      {OPTIONAL_LABELS[f]}
                    </label>
                    <select
                      id={`li-opt-${f}`}
                      value={opt[f]}
                      onChange={(e) => setOpt((o) => ({ ...o, [f]: e.target.value }))}
                      className={selectCls}
                    >
                      <option value="">Not in this file</option>
                      {head.headers.map((h) => (
                        <option key={h} value={`col:${h}`}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted">
                      {opt[f] !== "" && opt[f] === optSuggested[f] ? "Suggested from the column name: check it's right. " : ""}
                      {OPTIONAL_HINTS[f]}
                    </p>
                    {err && <p className="text-xs font-medium text-danger">{err}</p>}
                  </div>
                );
              })}
            </div>
            {opt.campaign !== "" && (
              <label className="mt-3 flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={fallback} onChange={(e) => setFallback(e.target.checked)} />
                <span>
                  If a campaign name in the file doesn&apos;t match one of your campaigns, put that row in{" "}
                  <strong>{campaign?.name ?? "the campaign from step 1"}</strong> instead of skipping it.
                </span>
              </label>
            )}
          </details>

          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={keepExtra} onChange={(e) => setKeepExtra(e.target.checked)} />
            <span>
              <span className="font-medium">Keep my other columns as extra information</span>
              <span className="block text-xs text-muted">
                Every column you haven&apos;t matched above is saved on the lead, so nothing in your file is lost.
              </span>
            </span>
          </label>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">First rows of your file</p>
            <TableWrap label="Rows to import">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-canvas text-left text-muted">
                    {head.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-1.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {head.rows.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      {r.map((c, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-1.5 text-ink">
                          {c || <span className="text-muted">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)} disabled={pending}>
              Back
            </Button>
            <Button onClick={toReview} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Next: review
            </Button>
          </div>
        </section>
      )}

      {step === 3 && preview && (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            This is a check only: nothing has been saved yet.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Rows in file" value={preview.totalRows} />
            <Stat label="Will be imported" value={preview.willImport} tone="good" testId="will-import" />
            <Stat label="Invalid numbers" value={preview.invalidCount} tone={preview.invalidCount ? "warn" : undefined} />
            <Stat label="Repeated in the file" value={preview.duplicatesInFileCount} tone={preview.duplicatesInFileCount ? "warn" : undefined} />
            <Stat label="Already in your workspace" value={preview.alreadyInWorkspace} />
            <Stat label="On the suppression list (skipped)" value={preview.suppressed} tone={preview.suppressed ? "warn" : undefined} />
          </div>
          {preview.ignoredEmails > 0 && (
            <p className="text-xs text-muted">
              {preview.ignoredEmails} email address{preview.ignoredEmails === 1 ? "" : "es"} didn&apos;t look valid and will be left empty.
            </p>
          )}
          {preview.phonelessHeld > 0 && (
            <p className="text-xs text-muted">
              {preview.phonelessHeld} row{preview.phonelessHeld === 1 ? "" : "s"} with a name or email but no phone number will be held as contacts to add a number to later.
            </p>
          )}

          {preview.campaignBreakdown.length > 1 || preview.unmatchedCampaignCount > 0 ? (
            <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Where the leads will go</div>
              <ul className="list-disc pl-5 text-xs">
                {preview.campaignBreakdown.map((c) => (
                  <li key={c.campaignId}>
                    {c.name}: {c.count}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview.unmatchedCampaigns.length > 0 && (
            <Issues
              title={`Rows skipped: campaign not found (${preview.unmatchedCampaignCount})`}
              items={preview.unmatchedCampaigns}
              total={preview.unmatchedCampaignCount}
              tone="danger"
            />
          )}
          {preview.invalidDates.length > 0 && (
            <Issues
              title={`Dates we couldn't read (${preview.invalidDateCount}): these leads are still imported, with the date left empty`}
              items={preview.invalidDates}
              total={preview.invalidDateCount}
            />
          )}
          {preview.extraColumns.length > 0 && (
            <p className="text-xs text-muted">
              Kept as extra information on each lead: {preview.extraColumns.slice(0, 12).join(", ")}
              {preview.extraColumns.length > 12 ? ` and ${preview.extraColumns.length - 12} more` : ""}.
            </p>
          )}

          {preview.invalid.length > 0 && (
            <Issues title={`Rows with invalid numbers (${preview.invalidCount})`} items={preview.invalid} total={preview.invalidCount} />
          )}
          {preview.duplicatesInFile.length > 0 && (
            <Issues title={`Repeated numbers in the file (${preview.duplicatesInFileCount})`} items={preview.duplicatesInFile} total={preview.duplicatesInFileCount} />
          )}

          {preview.sample.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">How the first leads will look</p>
              <TableWrap label="Sample rows">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-left text-muted">
                      <th className="px-3 py-1.5 font-medium">Name</th>
                      <th className="px-3 py-1.5 font-medium">Phone number</th>
                      <th className="px-3 py-1.5 font-medium">Company</th>
                      <th className="px-3 py-1.5 font-medium">Email</th>
                      {sampleExtras.map((k) => (
                        <th key={k} className="px-3 py-1.5 font-medium">
                          {sampleLabels[k]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((s) => (
                      <tr key={s.row} className="border-b border-line last:border-0">
                        <td className="px-3 py-1.5 text-ink">{s.name ?? <em className="text-muted">empty</em>}</td>
                        <td className="tabular px-3 py-1.5 text-ink">{s.phone}</td>
                        <td className="px-3 py-1.5 text-ink">{s.company ?? <em className="text-muted">empty</em>}</td>
                        <td className="px-3 py-1.5 text-ink">{s.email ?? <em className="text-muted">empty</em>}</td>
                        {sampleExtras.map((k) => (
                          <td key={k} className="px-3 py-1.5 text-ink">
                            {s[k] ? (
                              k === "appointment" || k === "lastContact" ? fmtDateTime(s[k] as string) : s[k]
                            ) : (
                              <em className="text-muted">empty</em>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          )}

          {isManager && (
            <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-white p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Before you import (optional)</legend>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={callMyself}
                  onChange={(e) => setCallMyself(e.target.checked)}
                />
                <span>
                  <span className="font-medium">I will call these myself</span>
                  <span className="block text-xs text-muted">
                    Assigns the imported leads to you and puts you on this campaign&apos;s roster, so they appear in your Dial workspace.
                    Other agents will not be served these leads.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" className="mt-1" checked={screenNow} onChange={(e) => setScreenNow(e.target.checked)} />
                <span>
                  <span className="font-medium">Run screening now</span>
                  <span className="block text-xs text-muted">
                    Leads can only be dialled after screening. This runs the manual screening check on this batch: it checks the numbers
                    against your workspace suppression list only. It is not a live TPS or National DNC lookup. Off by default, because
                    screening is a deliberate compliance step.
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)} disabled={pending}>
              Back
            </Button>
            <Button onClick={doImport} disabled={pending || (preview.willImport === 0 && preview.phonelessHeld === 0)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import {preview.willImport} lead
              {preview.willImport === 1 ? "" : "s"}
            </Button>
          </div>
          {preview.willImport === 0 && preview.phonelessHeld === 0 && (
            <p className="text-xs text-danger">Nothing can be imported from this file. Go back and check the column choices.</p>
          )}
        </section>
      )}

      {step === 4 && done && (
        <section className="flex flex-col gap-4" data-testid="import-result">
          <div className="flex items-center gap-2 text-base font-semibold text-ink">
            <CheckCircle2 className="h-5 w-5 text-brand-green-text" />
            Imported {done.result.imported} lead{done.result.imported === 1 ? "" : "s"} into {done.campaignName}
          </div>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
            <li>{done.result.skippedInvalid} skipped: invalid or missing phone number</li>
            <li>{done.result.skippedDuplicates} skipped: repeated in the file</li>
            <li>{done.result.skippedExisting} skipped: already in your workspace</li>
            <li>{done.result.skippedSuppressed} skipped: on the suppression list</li>
            {done.result.skippedUnknownCampaign > 0 && <li>{done.result.skippedUnknownCampaign} skipped: campaign name not found</li>}
            {done.result.campaigns.length > 1 &&
              done.result.campaigns.map((c) => (
                <li key={c.campaignId}>
                  {c.count} into {c.name}
                </li>
              ))}
            {done.result.phonelessHeld > 0 && <li>{done.result.phonelessHeld} held as contacts without a number</li>}
            {done.result.assignedToMe > 0 && <li>{done.result.assignedToMe} assigned to you, and you are on this campaign&apos;s roster</li>}
            {done.result.screened + screenedLater > 0 && (
              <li>{done.result.screened + screenedLater} screened (manual check against your suppression list): ready to dial</li>
            )}
          </ul>

          {isManager && done.result.imported > 0 && done.result.screened + screenedLater === 0 && (
            <div className="rounded-lg border border-gold/40 bg-gold-tint px-3 py-2 text-sm text-ink">
              These leads are <strong>pending screening</strong>, so nobody can dial them yet.
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={screenAfter} disabled={pending}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Run screening now
                </Button>
                <span className="ml-2 text-xs text-muted">Manual check against your suppression list, not a live TPS/DNC lookup.</span>
              </div>
            </div>
          )}
          {!isManager && (
            <p className="text-sm text-muted">The leads are in your inbox. A manager screens them before they can be dialled.</p>
          )}

          <div className="flex flex-wrap gap-2">
            {isManager && (
              <Button asChild>
                <Link href="/dial">
                  <Headset className="h-4 w-4" /> Start dialing
                </Link>
              </Button>
            )}
            <Button asChild variant="secondary">
              <Link href={isManager ? `/admin/campaigns/${done.result.campaignId}` : "/leadgen/leads"}>
                {isManager ? "Open the campaign" : "View lead inbox"}
              </Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                reset();
                onFinished?.();
              }}
            >
              Import another file
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: number; tone?: "good" | "warn"; testId?: string }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        tone === "good" ? "border-brand-green/40 bg-white" : tone === "warn" ? "border-gold/40 bg-gold-tint" : "border-line bg-white"
      }`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div className="font-display text-xl font-semibold text-ink" data-testid={testId}>
        {value.toLocaleString("en-GB")}
      </div>
    </div>
  );
}

function Issues({
  title,
  items,
  total,
  tone,
}: {
  title: string;
  items: { row: number; value: string; reason: string }[];
  total: number;
  tone?: "danger";
}) {
  return (
    <details className={`rounded-lg border bg-white ${tone === "danger" ? "border-danger/40" : "border-line"}`} open={items.length <= 5}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink">{title}</summary>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line text-xs">
        {items.map((it, i) => (
          <li key={i} className="flex flex-wrap gap-x-3 px-3 py-1.5">
            <span className="font-medium text-ink">Row {it.row}</span>
            <span className="tabular text-muted">{it.value || "(empty)"}</span>
            <span className="text-danger">{it.reason}</span>
          </li>
        ))}
        {total > items.length && <li className="px-3 py-1.5 text-muted">...and {total - items.length} more.</li>}
      </ul>
    </details>
  );
}

// The same importer in a dialog, for pages that already have a toolbar
// (Lead inbox, Data).
export function LeadImporterDialog(props: Props & { label?: string }) {
  const [open, setOpen] = useState(false);
  const { label, ...rest } = props;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-3.5 w-3.5" /> {label ?? "Import leads"}
      </Button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>Upload a CSV or Excel file and match its columns to Name, Phone number, Company and Email.</DialogDescription>
        </DialogHeader>
        <LeadImporter {...rest} onFinished={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
