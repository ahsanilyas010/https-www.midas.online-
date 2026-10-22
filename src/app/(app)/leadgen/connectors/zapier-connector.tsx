"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, FlaskConical, KeyRound, Loader2, Webhook } from "lucide-react";
import { dryRunIntake, revokeIntakeToken, rotateIntakeToken, type DryRunResult } from "@/lib/actions/intake";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";

function useOrigin() {
  const [origin, setOrigin] = useState("https://your-app.example.com");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`${what} copied`);
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink">{label}</span>
        <Button size="sm" variant="secondary" onClick={() => copy(text, label)}>
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-canvas p-3 text-[11px] leading-relaxed text-ink">{text}</pre>
    </div>
  );
}

export function sampleBody(campaign: string, source: string) {
  return {
    campaign_id: campaign,
    source,
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: "+14155550123",
    company: "Analytical Engines Ltd",
    title: "Head of Operations",
    linkedin_url: "https://www.linkedin.com/in/ada-example",
    city: "London",
    state: "",
    country: "GB",
    consent: true,
    consent_text: "Business contact sourced via Apollo; legitimate interest, B2B outreach.",
  };
}

export function TokenCard({ tokenPrefix, lastUsedAt }: { tokenPrefix: string | null; lastUsedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();
  const origin = useOrigin();
  const url = `${origin}/api/leads/inbound`;

  function generate() {
    startTransition(async () => {
      const r = await rotateIntakeToken();
      if (r.error || !r.token) {
        toast.error(r.error ?? "Could not generate a token.");
        return;
      }
      setToken(r.token);
      toast.success(tokenPrefix ? "Token rotated. The old one no longer works." : "Webhook token created");
      router.refresh();
    });
  }
  function revoke() {
    startTransition(async () => {
      const r = await revokeIntakeToken();
      if (r.error) {
        toast.error(r.error);
        return;
      }
      setToken(null);
      toast.success("Webhook disabled");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Webhook className="h-4 w-4 text-brand-blue" />
          <CardTitle>Zapier webhook</CardTitle>
          {tokenPrefix ? <Badge variant="confirm">Enabled</Badge> : <Badge variant="neutral">Disabled</Badge>}
        </div>
        <CardDescription>
          One connector for every lead source. Apollo and Clay push into Zapier; Zapier posts each lead here. Leads
          arrive pending screening and are not dialable until a manager screens them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-ink">Webhook URL (POST)</span>
            <Button size="sm" variant="secondary" onClick={() => copy(url, "Webhook URL")}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <code className="block break-all rounded-md bg-canvas p-2 text-xs text-ink">{url}</code>
        </div>

        {tokenPrefix && (
          <p className="text-xs text-muted">
            <KeyRound className="mr-1 inline h-3.5 w-3.5" />
            Current token <code className="tabular">{tokenPrefix}…</code> · last lead received{" "}
            {lastUsedAt ? fmtDateTime(lastUsedAt) : "never"}
          </p>
        )}

        {token && (
          <div className="rounded-md border border-warning/40 bg-warning-tint p-3">
            <p className="mb-1 text-xs font-medium text-warning">Copy this token now. It is shown only once.</p>
            <div className="flex items-center gap-2">
              <code className="tabular flex-1 break-all text-xs text-ink">{token}</code>
              <Button size="sm" variant="secondary" onClick={() => copy(token, "Token")}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={generate} disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {tokenPrefix ? "Rotate token" : "Generate token"}
          </Button>
          {tokenPrefix && (
            <Button size="sm" variant="secondary" onClick={revoke} disabled={pending}>
              Disable webhook
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted">
          Rotating replaces the token immediately: update the Authorization header in every Zap that uses it. Send it as{" "}
          <code>Authorization: Bearer lci_...</code>.
        </p>
      </CardContent>
    </Card>
  );
}

const FIELDS: [string, string, string][] = [
  ["campaign_id", "campaign_id, campaign, campaign_code (a campaign id, code or exact name)", "Required"],
  ["phone", "phone, mobile, phone_number, direct_phone, mobile_phone, cell, telephone", "Required"],
  ["consent", "consent (true, \"true\", \"yes\", 1)", "Required"],
  ["consent_text", "consent_text (the wording or lawful basis you rely on, 5+ characters)", "Required"],
  ["first_name / last_name", "first_name, last_name, or name / full_name (split on the first space)", "Optional"],
  ["email", "email, work_email, email_address", "Optional"],
  ["company_name", "company, organization, organization_name, company_name", "Optional"],
  ["job_title", "title, job_title, position", "Optional"],
  ["linkedin_url", "linkedin_url, linkedin (kept in custom fields)", "Optional"],
  ["city / region / postcode / country", "city, state or region, zip or postal_code, country (ISO code or name; used to read local-format numbers)", "Optional"],
  ["source", "source, as sent: zapier, apollo, clay (webhook if you send none). Shown in the lead inbox and the delivery log", "Optional"],
  ["anything else", "Kept in the lead's custom fields (strings, numbers, booleans)", "Optional"],
];

export function PayloadReference({ campaign }: { campaign: string }) {
  const origin = useOrigin();
  const json = JSON.stringify(sampleBody(campaign, "zapier"), null, 2);
  const curl = `curl -X POST "${origin}/api/leads/inbound" \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(sampleBody(campaign, "zapier"))}'`;
  const dry = curl.replace('inbound"', 'inbound?dry_run=1"');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payload reference</CardTitle>
        <CardDescription>
          Field names from Apollo, Clay and Zapier are matched automatically. Responses: 201 created, 400 invalid, 401
          bad token, 409 duplicate, 422 suppressed number, 429 rate limited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-muted">
                <th className="px-2 py-1.5 font-medium">Field</th>
                <th className="px-2 py-1.5 font-medium">Accepted names</th>
                <th className="px-2 py-1.5 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(([f, names, req]) => (
                <tr key={f} className="border-b border-line last:border-0">
                  <td className="px-2 py-1.5 font-medium text-ink">{f}</td>
                  <td className="px-2 py-1.5 text-muted">{names}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={req === "Required" ? "warning" : "neutral"}>{req}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CopyBlock label="Sample JSON payload" text={json} />
        <CopyBlock label="curl" text={curl} />
        <CopyBlock label="curl (dry run: validates only, saves nothing)" text={dry} />
        <p className="text-[11px] text-muted">
          Add <code>?dry_run=1</code> to the URL (or send a header <code>X-Dry-Run: 1</code>) to validate a delivery without
          saving it. Dry runs are not written to the delivery log.
        </p>
      </CardContent>
    </Card>
  );
}

export function DryRunTester({ campaign }: { campaign: string }) {
  const [text, setText] = useState(JSON.stringify(sampleBody(campaign, "zapier"), null, 2));
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => setResult(await dryRunIntake(text)));
  }

  const body = result?.body as { would?: string; error?: string; message?: string } | undefined;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand-blue" />
          <CardTitle>Test a payload (dry run)</CardTitle>
        </div>
        <CardDescription>
          Runs your JSON through the same checks as a real delivery (consent, campaign, phone, suppression, duplicates)
          and reports what would happen. Nothing is saved or logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" spellCheck={false} />
        <Button size="sm" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />} Run dry run
        </Button>
        {result && (
          <div className="space-y-2">
            {result.error ? (
              <p className="rounded-md bg-danger-tint px-3 py-2 text-xs text-danger">{result.error}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={body?.would === "created" ? "confirm" : "danger"}>
                    {body?.would === "created" ? "Would be created" : `Would be rejected: ${body?.would ?? "invalid"}`}
                  </Badge>
                  <span className="text-xs text-muted">HTTP {result.status}</span>
                </div>
                <pre className="max-h-72 overflow-auto rounded-md bg-canvas p-3 text-[11px] leading-relaxed text-ink">
                  {JSON.stringify(result.body, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

export function SetupGuides({ campaign }: { campaign: string }) {
  const origin = useOrigin();
  const url = `${origin}/api/leads/inbound`;
  const mapping = (source: string) =>
    JSON.stringify(
      {
        campaign_id: campaign,
        source,
        first_name: "{{First Name}}",
        last_name: "{{Last Name}}",
        email: "{{Email}}",
        phone: "{{Phone}}",
        company: "{{Company}}",
        title: "{{Title}}",
        linkedin_url: "{{LinkedIn URL}}",
        city: "{{City}}",
        state: "{{State}}",
        country: "{{Country}}",
        consent: "true",
        consent_text: "Business contact; legitimate interest (B2B outreach).",
      },
      null,
      2,
    );

  const post = (source: string) => (
    <>
      Add the action <strong>Webhooks by Zapier &rarr; POST</strong>. URL: <code>{url}</code>. Payload Type:{" "}
      <strong>Json</strong>. Data (map each value from the previous step, using your own field picker in place of the
      <code> {"{{...}}"}</code> placeholders):
      <pre className="mt-1 overflow-x-auto rounded-md bg-canvas p-2 text-[11px]">{mapping(source)}</pre>
      Headers: <code>Authorization</code> = <code>Bearer &lt;your token&gt;</code> and <code>Content-Type</code> ={" "}
      <code>application/json</code>. Leave <em>Unflatten</em> on and <em>Wrap Request In Array</em> off.
    </>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup guides</CardTitle>
        <CardDescription>
          There is no direct Apollo or Clay integration: both push leads into Zapier, and the Zapier webhook above is the
          one connector. Add <code>?dry_run=1</code> to the URL while you test, then remove it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="apollo">
          <TabsList className="mb-3">
            <TabsTrigger value="apollo">Apollo to Zapier to LeadCallient</TabsTrigger>
            <TabsTrigger value="clay">Clay to Zapier to LeadCallient</TabsTrigger>
          </TabsList>
          <TabsContent value="apollo">
            <Steps
              items={[
                <>
                  In Zapier, create a Zap. Trigger: <strong>Apollo.io</strong> and the event that fits (for example{" "}
                  <em>New Contact</em> or <em>Contact Added to a List</em>). Connect your Apollo account and test the
                  trigger so Zapier has a sample record.
                </>,
                <>
                  Add a <strong>Filter by Zapier</strong> step: continue only if <em>Phone</em> exists. Leads without a
                  phone number are rejected by the webhook (400) because they cannot be called.
                </>,
                post("apollo"),
                <>
                  Press <strong>Test step</strong>. With <code>?dry_run=1</code> on the URL, Zapier shows what would
                  happen and nothing is saved. Remove the parameter, test again, and the lead appears in the delivery log
                  below and in the Lead inbox.
                </>,
                <>
                  Publish the Zap. Apollo leads arrive tagged <code>apollo</code>, unassigned and pending screening.
                  Hand them to a sales agent from the Lead inbox.
                </>,
              ]}
            />
          </TabsContent>
          <TabsContent value="clay">
            <Steps
              items={[
                <>
                  In Zapier, create a Zap with the trigger <strong>Webhooks by Zapier &rarr; Catch Hook</strong>. Copy the
                  custom webhook URL Zapier gives you.
                </>,
                <>
                  In your Clay table, add an enrichment / action that sends a row to a webhook or Zapier (search for{" "}
                  <em>Zapier</em> or <em>HTTP API</em>), paste the Catch Hook URL, and map the columns you want to send:
                  phone, first and last name, email, company, title, LinkedIn URL, city, state, country. Run it on one row
                  so Zapier receives a sample.
                </>,
                <>
                  Back in Zapier, test the trigger, then add a <strong>Filter by Zapier</strong> step: continue only if{" "}
                  <em>phone</em> exists.
                </>,
                post("clay"),
                <>
                  Test with <code>?dry_run=1</code>, remove it, publish the Zap, and switch the Clay column to run
                  automatically. Clay leads arrive tagged <code>clay</code>, unassigned and pending screening.
                </>,
              ]}
            />
          </TabsContent>
        </Tabs>
        <p className="mt-3 text-[11px] text-muted">
          Compliance: every delivery must carry <code>consent: true</code> and the wording or lawful basis you rely on in{" "}
          <code>consent_text</code>. Numbers on the suppression list are refused (422), repeats are refused (409), and
          nothing is dialable until a manager has screened it.
        </p>
      </CardContent>
    </Card>
  );
}
