import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireRole } from "@/lib/auth/current-profile";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { createRealClient } from "@/lib/supabase/real";
import { CopyField, ZoomActions, ZoomSettingsForm } from "./zoom-settings-form";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Zoom", robots: { index: false, follow: false } };

const SCOPES = [
  "meeting:write:meeting:admin",
  "meeting:read:meeting:admin",
  "meeting:update:meeting:admin",
  "meeting:delete:meeting:admin",
  "user:read:user:admin",
];

export default async function ZoomSettingsPage() {
  const profile = await requireRole(["super_admin", "ops_manager"]);
  if (profile.role !== "super_admin" && profile.role !== "ops_manager") redirect("/start");

  const workspace = await getCurrentWorkspace();
  const supabase = await createRealClient();
  // Column list excludes client_secret_id: the secret is never readable here.
  const { data: cred } = await supabase
    .from("zoom_credentials")
    .select("account_id, client_id, status, verified_at, last_error")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const connected = cred?.status === "connected";
  // The address this page was opened on, not a configured guess: Zoom checks
  // the domain the embed is loaded from, so it has to be exactly this one.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const site = host ? `${proto}://${host}` : "";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Zoom</h1>
        <p className="mt-1 text-sm text-muted">
          Zoom runs your meetings (this page connects the Meetings API) and your calling (Zoom Phone, set up in your Zoom account, see the
          checklist below).
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Meetings: Server-to-Server OAuth app</h2>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 py-3 text-sm">
          {connected ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-brand-green-text" />
              <span className="font-medium text-ink">Connected</span>
              {cred?.verified_at && <span className="text-muted">Last verified {fmtDateTime(cred.verified_at, profile.timezone)}</span>}
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-danger" />
              <span className="font-medium text-ink">{cred ? "Not verified" : "Not connected"}</span>
              {cred?.last_error && <span className="text-muted">{cred.last_error}</span>}
            </>
          )}
        </div>
        {cred && (
          <div className="grid gap-1 text-xs text-muted">
            <div>
              Account ID: <span className="font-mono">{cred.account_id}</span>
            </div>
            <div>
              Client ID: <span className="font-mono">{cred.client_id}</span>
            </div>
            <div>Client Secret: stored encrypted, never shown again.</div>
          </div>
        )}
        {cred && <ZoomActions />}

        {cred ? (
          <details className="rounded-lg border border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">Replace credentials</summary>
            <div className="mt-3">
              <ZoomSettingsForm />
            </div>
          </details>
        ) : (
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Connect Zoom</h3>
            <ZoomSettingsForm />
          </div>
        )}

        <div className="border-t border-line pt-4">
          <h3 className="text-sm font-medium text-ink">How to create the Zoom app</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>
              A Zoom account owner or admin opens the{" "}
              <a className="underline" href="https://marketplace.zoom.us/" target="_blank" rel="noopener noreferrer">
                Zoom App Marketplace
              </a>
              , then Develop &gt; Build App.
            </li>
            <li>
              Choose <strong>Server-to-Server OAuth App</strong> and give it a name (for example &ldquo;LeadCallient meetings&rdquo;).
            </li>
            <li>
              Copy the <strong>Account ID</strong>, <strong>Client ID</strong> and <strong>Client Secret</strong> from the App Credentials
              page into the form above.
            </li>
            <li>
              Fill in the required information (company name, contact name and email), then on the <strong>Scopes</strong> step add these
              scopes:
              <ul className="mt-1 space-y-0.5 font-mono text-xs text-ink">
                {SCOPES.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <span className="text-xs">
                Zoom may label them under Meeting and User. Only grant what is listed; the app can then create, read, change and delete
                meetings and look up users on your account.
              </span>
            </li>
            <li>
              Click <strong>Activate</strong>. Tokens do not work until the app shows as Activated.
            </li>
            <li>
              Back here, press Save and verify. Each person who hosts a meeting must have a Zoom user on the account with the{" "}
              <strong>same email</strong> as their login here.
            </li>
          </ol>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Zoom Phone calling checklist</h2>
        <p className="text-sm text-muted">
          Calls are placed with Zoom Phone Smart Embed inside the dial screen. These steps happen in your Zoom account and cannot be
          checked from here, so work through them with your Zoom admin if an agent&rsquo;s phone panel does not appear.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>
            Install <strong>Zoom Phone Smart Embed</strong> from the Zoom App Marketplace for your account.
          </li>
          <li>
            In the Zoom web portal go to Account Settings &gt; Zoom Phone and turn on{" "}
            <strong>Automatically Call From Third Party Apps</strong>.
          </li>
          <li>
            Add the address you are using right now as an approved domain for the Smart Embed app. Use exactly this one; if you
            later move to a custom domain, add that too:
            <CopyField value={host || site} />
          </li>
          <li>
            Agents use the Zoom desktop client <strong>version 5.9.0 or newer</strong> (keep it updated) or a supported browser.
          </li>
          <li>
            Every caller needs a <strong>Zoom Phone licence</strong> and signs in inside the phone panel on the dial screen the first
            time.
          </li>
        </ol>
      </section>
    </div>
  );
}
