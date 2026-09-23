import "server-only";
import { randomUUID } from "crypto";
import type {
  DialerAdapter,
  DialerProviderKey,
  OutboundCallRequest,
  PlacedCall,
  ProviderHttpRequest,
} from "./types";

// One adapter per dialer provider. Each knows how to turn "call this lead"
// into that provider's API request. The rest of the CRM only sees the
// DialerAdapter interface, so adding a provider = adding a builder here.
//
// THE SWITCH: TELEPHONY_MODE decides whether placeCall() actually sends the
// request. The demo build simulates the call; flip to "live" once real
// provider credentials are stored server-side (encrypted) and passed in as
// `credentials` below.
export const TELEPHONY_MODE: "demo" | "live" = "demo";

type Credentials = Record<string, string>;

// Placeholders are shown in the demo's API preview instead of real secrets.
function cred(c: Credentials, key: string) {
  return c[key] ?? `{{${key}}}`;
}

function basic(user: string, pass: string) {
  if (user.startsWith("{{")) return `Basic {{base64(${user.slice(2, -2)}:${pass.slice(2, -2)})}}`;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

const BUILDERS: Record<DialerProviderKey, (req: OutboundCallRequest, c: Credentials) => ProviderHttpRequest> = {
  zoom_phone: (req) => ({
    kind: "deeplink",
    url: `zoomphonecall://${encodeURIComponent(req.to)}?callerid=${encodeURIComponent(req.from)}`,
    note: "Opens the agent's Zoom Phone app with the number dialled. Call details sync back from GET /v2/phone/call_history.",
  }),
  google_voice: (req) => ({
    kind: "deeplink",
    url: `https://voice.google.com/u/0/calls?a=nc,${encodeURIComponent(req.to)}`,
    note: "Opens Google Voice in the browser with the number ready to call.",
  }),
  dialpad: (req, c) => ({
    kind: "http",
    method: "POST",
    url: "https://dialpad.com/api/v2/call",
    headers: { Authorization: `Bearer ${cred(c, "api_key")}`, "Content-Type": "application/json" },
    body: {
      phone_number: req.to,
      user_id: req.agentExtension ?? cred(c, "user_id"),
      outbound_caller_id: req.from,
      custom_data: JSON.stringify(req.metadata ?? {}),
    },
  }),
  aircall: (req, c) => ({
    kind: "http",
    method: "POST",
    url: `https://api.aircall.io/v1/users/${req.agentExtension ?? cred(c, "user_id")}/calls`,
    headers: { Authorization: basic(cred(c, "api_id"), cred(c, "api_token")), "Content-Type": "application/json" },
    body: { number_id: Number(c.number_id) || cred(c, "number_id"), to: req.to },
  }),
  ringcentral: (req, c) => ({
    kind: "http",
    method: "POST",
    url: "https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/ring-out",
    headers: { Authorization: `Bearer ${cred(c, "access_token")}`, "Content-Type": "application/json" },
    body: {
      from: { phoneNumber: req.agentExtension ?? req.from },
      to: { phoneNumber: req.to },
      callerId: { phoneNumber: req.from },
      playPrompt: false,
    },
  }),
  twilio: (req, c) => ({
    kind: "http",
    method: "POST",
    url: `https://api.twilio.com/2010-04-01/Accounts/${cred(c, "account_sid")}/Calls.json`,
    headers: {
      Authorization: basic(cred(c, "account_sid"), cred(c, "auth_token")),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: {
      To: req.to,
      From: req.from,
      Url: "https://<your-app>/api/telephony/twilio/twiml?bridge=agent",
      Record: req.record ? "true" : "false",
      StatusCallback: "https://<your-app>/api/telephony/twilio/status",
    },
  }),
  vonage: (req, c) => ({
    kind: "http",
    method: "POST",
    url: "https://api.nexmo.com/v1/calls",
    headers: { Authorization: `Bearer ${cred(c, "jwt")}`, "Content-Type": "application/json" },
    body: {
      to: [{ type: "phone", number: req.to.replace(/^\+/, "") }],
      from: { type: "phone", number: req.from.replace(/^\+/, "") },
      ncco: [
        ...(req.record ? [{ action: "record" }] : []),
        { action: "connect", endpoint: [{ type: "app", user: req.agentExtension ?? "agent" }] },
      ],
      event_url: ["https://<your-app>/api/telephony/vonage/events"],
    },
  }),
};

export function createDialerAdapter(provider: DialerProviderKey, credentials: Credentials = {}): DialerAdapter {
  const build = BUILDERS[provider];
  return {
    provider,
    buildOutboundCall: (req) => build(req, credentials),
    async placeCall(req: OutboundCallRequest): Promise<PlacedCall> {
      const request = build(req, credentials);
      if (TELEPHONY_MODE === "live" && request.kind === "http") {
        const res = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body:
            request.headers["Content-Type"] === "application/x-www-form-urlencoded"
              ? new URLSearchParams(request.body as Record<string, string>)
              : JSON.stringify(request.body),
        });
        if (!res.ok) throw new Error(`${provider} rejected the call (${res.status}): ${await res.text()}`);
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return { providerCallId: String(body.id ?? body.sid ?? body.uuid ?? body.call_id ?? randomUUID()), status: "ringing", request };
      }
      // Demo (or deep-link providers): the call is simulated in the softphone.
      return { providerCallId: `${provider}_${randomUUID().slice(0, 8)}`, status: "ringing", request };
    },
    async hangUp() {
      // Live mode: DELETE / PUT the provider's call resource here.
    },
  };
}
