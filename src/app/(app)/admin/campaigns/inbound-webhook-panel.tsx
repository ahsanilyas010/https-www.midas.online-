"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { revokeIntakeToken, rotateIntakeToken } from "@/lib/actions/intake";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";

export function InboundWebhookPanel({
  tokenPrefix,
  lastUsedAt,
  exampleCampaignId,
}: {
  tokenPrefix: string | null;
  lastUsedAt: string | null;
  exampleCampaignId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();
  const origin = typeof window === "undefined" ? "https://your-app" : window.location.origin;

  function generate() {
    startTransition(async () => {
      const result = await rotateIntakeToken();
      if (result.error || !result.token) {
        toast.error(result.error ?? "Could not generate a token.");
        return;
      }
      setToken(result.token);
      toast.success(tokenPrefix ? "Token rotated. The old one no longer works." : "Webhook token created");
      router.refresh();
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeIntakeToken();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setToken(null);
      toast.success("Webhook disabled");
      router.refresh();
    });
  }

  const shown = token ?? "<YOUR_TOKEN>";
  const curl = `curl -X POST ${origin}/api/leads/inbound \\
  -H "Authorization: Bearer ${shown}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "campaign_id": "${exampleCampaignId ?? "<CAMPAIGN_ID>"}",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "phone": "+14155550123",
    "email": "ada@example.com",
    "consent": true,
    "consent_text": "I agree to be contacted by phone about this offer."
  }'`;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="mb-1 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-blue" />
          <h3 className="text-sm font-semibold text-ink">Inbound lead webhook</h3>
          {tokenPrefix ? <Badge variant="confirm">Enabled</Badge> : <Badge variant="neutral">Disabled</Badge>}
        </div>
        <p className="mb-3 text-xs text-muted">
          Post leads from a landing page or another tool straight into a campaign. Each request must carry this
          workspace&rsquo;s token, include explicit consent, and is rate limited. Leads arrive unscreened and are not
          dialable until you screen them.
        </p>

        {tokenPrefix && (
          <p className="mb-3 text-xs text-muted">
            Current token <code className="tabular">{tokenPrefix}…</code> · last used{" "}
            {lastUsedAt ? fmtDateTime(lastUsedAt) : "never"}
          </p>
        )}

        {token && (
          <div className="mb-3 rounded-md border border-warning/40 bg-warning-tint p-3">
            <p className="mb-1 text-xs font-medium text-warning">Copy this token now. It is shown only once.</p>
            <div className="flex items-center gap-2">
              <code className="tabular flex-1 break-all text-xs text-ink">{token}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(token);
                  toast.success("Token copied");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
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
      </div>

      <div className="rounded-lg border border-line bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Example request</h3>
        <pre className="overflow-x-auto rounded-md bg-canvas p-3 text-[11px] leading-relaxed text-ink">{curl}</pre>
        <p className="mt-2 text-[11px] text-muted">
          Required: <code>campaign_id</code>, <code>phone</code>, <code>consent: true</code>, <code>consent_text</code>.
          Optional: first_name, last_name, company_name, job_title, email, city, region, postcode, address_line1, country
          (ISO code used to parse local-format numbers) and a flat <code>custom</code> object. Responses: 201 created, 400
          invalid, 401 bad token, 409 duplicate, 422 suppressed number, 429 rate limited.
        </p>
      </div>
    </div>
  );
}
