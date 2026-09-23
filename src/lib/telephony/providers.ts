import type { DialerProviderMeta, DialerProviderKey } from "./types";

// Catalogue of dialer subscriptions a client can bring. Client-safe metadata
// only — adapters (src/lib/telephony/adapters) hold the per-provider logic.

export const DIALER_PROVIDERS: DialerProviderMeta[] = [
  {
    key: "zoom_phone",
    name: "Zoom Phone",
    tagline: "Cloud phone system inside Zoom Workplace",
    color: "#0b5cff",
    initials: "ZP",
    auth: "oauth",
    credentialFields: [
      { key: "account_id", label: "Account ID" },
      { key: "client_id", label: "Client ID" },
      { key: "client_secret", label: "Client secret", secret: true },
    ],
    capabilities: ["click_to_call", "call_recording", "call_events_webhook", "sms", "call_transfer"],
    integrationNote:
      "Click-to-call launches the Zoom Phone client via the zoomphonecall:// link (or Smart Embed). Call logs and recordings come back through the Zoom Phone API and phone.* webhooks.",
    docsUrl: "https://developers.zoom.us/docs/api/phone/",
  },
  {
    key: "dialpad",
    name: "Dialpad",
    tagline: "AI-powered business calling",
    color: "#7c3aed",
    initials: "DP",
    auth: "api_key",
    credentialFields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "user_id", label: "Dialpad user ID", help: "The agent's Dialpad user that places the call." },
    ],
    capabilities: ["click_to_call", "call_recording", "call_events_webhook", "sms", "power_dialer", "call_transfer"],
    integrationNote: "POST /api/v2/call rings the agent's Dialpad app, then dials the lead. Call events arrive via Dialpad webhooks.",
    docsUrl: "https://developers.dialpad.com/",
  },
  {
    key: "google_voice",
    name: "Google Voice",
    tagline: "Calling for Google Workspace",
    color: "#188038",
    initials: "GV",
    auth: "oauth",
    credentialFields: [{ key: "workspace_domain", label: "Workspace domain", placeholder: "yourcompany.com" }],
    capabilities: ["click_to_call", "call_recording"],
    integrationNote:
      "Google Voice has no public call-control API, so click-to-call opens voice.google.com with the number filled in. Calls are logged in the CRM when the agent dispositions them.",
    docsUrl: "https://support.google.com/a/topic/9408450",
  },
  {
    key: "aircall",
    name: "Aircall",
    tagline: "Cloud call-centre phone system",
    color: "#00b388",
    initials: "AC",
    auth: "api_key",
    credentialFields: [
      { key: "api_id", label: "API ID" },
      { key: "api_token", label: "API token", secret: true },
      { key: "user_id", label: "Aircall user ID" },
      { key: "number_id", label: "Aircall number ID" },
    ],
    capabilities: ["click_to_call", "call_recording", "call_events_webhook", "power_dialer", "call_transfer"],
    integrationNote: "POST /v1/users/{user_id}/calls starts the call in the agent's Aircall app. Webhooks report call.answered / call.ended.",
    docsUrl: "https://developer.aircall.io/api-references/",
  },
  {
    key: "ringcentral",
    name: "RingCentral",
    tagline: "Enterprise cloud communications",
    color: "#f80",
    initials: "RC",
    auth: "oauth",
    credentialFields: [
      { key: "client_id", label: "Client ID" },
      { key: "client_secret", label: "Client secret", secret: true },
    ],
    capabilities: ["click_to_call", "call_recording", "call_events_webhook", "sms", "call_transfer"],
    integrationNote: "RingOut (POST /restapi/v1.0/account/~/extension/~/ring-out) rings the agent first, then connects the lead.",
    docsUrl: "https://developers.ringcentral.com/api-reference",
  },
  {
    key: "twilio",
    name: "Twilio Voice",
    tagline: "Programmable voice APIs",
    color: "#f22f46",
    initials: "TW",
    auth: "api_key",
    credentialFields: [
      { key: "account_sid", label: "Account SID" },
      { key: "auth_token", label: "Auth token", secret: true },
    ],
    capabilities: ["click_to_call", "call_recording", "call_events_webhook", "power_dialer", "voicemail_drop", "local_presence"],
    integrationNote: "POST /2010-04-01/Accounts/{sid}/Calls.json creates the call; TwiML bridges agent and lead. Status callbacks report progress.",
    docsUrl: "https://www.twilio.com/docs/voice/api/call-resource",
  },
  {
    key: "vonage",
    name: "Vonage",
    tagline: "Voice API and business phone",
    color: "#871fff",
    initials: "VG",
    auth: "api_key",
    credentialFields: [
      { key: "application_id", label: "Application ID" },
      { key: "private_key", label: "Private key", secret: true },
    ],
    capabilities: ["click_to_call", "call_recording", "call_events_webhook", "local_presence"],
    integrationNote: "POST /v1/calls with an NCCO connects the lead; event webhooks report call status.",
    docsUrl: "https://developer.vonage.com/en/api/voice",
  },
];

export function providerMeta(key: string | null | undefined): DialerProviderMeta | undefined {
  return DIALER_PROVIDERS.find((p) => p.key === key);
}

export const CAPABILITY_LABEL: Record<string, string> = {
  click_to_call: "Click-to-call",
  call_recording: "Call recording",
  call_events_webhook: "Live call events",
  power_dialer: "Power dialling",
  sms: "SMS",
  voicemail_drop: "Voicemail drop",
  call_transfer: "Call transfer",
  local_presence: "Local presence",
};

export function isProviderKey(key: string): key is DialerProviderKey {
  return DIALER_PROVIDERS.some((p) => p.key === key);
}
