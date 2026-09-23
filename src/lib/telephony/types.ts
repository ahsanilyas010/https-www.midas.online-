// Telephony layer — the contract every dialer provider (Zoom Phone, Dialpad,
// Aircall, RingCentral, Twilio, …) is plugged in behind. The CRM only ever
// talks to this interface, so switching the client's dialer subscription is
// a settings change, not a code change.
//
// Client-safe: no secrets or server-only imports in this file.

export type DialerProviderKey =
  | "zoom_phone"
  | "dialpad"
  | "google_voice"
  | "aircall"
  | "ringcentral"
  | "twilio"
  | "vonage";

export type DialMode = "click_to_call" | "preview" | "power";

export type CallStatus = "ringing" | "connected" | "on_hold" | "completed" | "missed" | "failed";

export type Capability =
  | "click_to_call"
  | "call_recording"
  | "call_events_webhook"
  | "power_dialer"
  | "sms"
  | "voicemail_drop"
  | "call_transfer"
  | "local_presence";

export interface CredentialField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  help?: string;
}

export interface DialerProviderMeta {
  key: DialerProviderKey;
  name: string;
  tagline: string;
  /** Brand-ish accent used for the provider's tile in the UI. */
  color: string;
  initials: string;
  auth: "oauth" | "api_key";
  credentialFields: CredentialField[];
  capabilities: Capability[];
  /** How click-to-call is achieved with this provider's public API. */
  integrationNote: string;
  docsUrl: string;
}

export interface OutboundCallRequest {
  to: string; // E.164
  from: string; // caller ID, E.164
  agentExtension?: string; // provider-side user / extension / device id
  record: boolean;
  metadata?: Record<string, string>; // lead id etc., echoed back on webhooks
}

/**
 * What an adapter does to start a call — shown in the demo's API preview.
 * Most providers expose a REST "make call" endpoint; a few (Zoom Phone,
 * Google Voice) only support click-to-call by opening their app via a link.
 */
export type ProviderHttpRequest =
  | {
      kind: "http";
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      url: string;
      headers: Record<string, string>;
      body?: unknown;
    }
  | { kind: "deeplink"; url: string; note: string };

export interface PlacedCall {
  providerCallId: string;
  status: CallStatus;
  request: ProviderHttpRequest;
}

export interface DialerAdapter {
  provider: DialerProviderKey;
  /** Build the provider request for an outbound call (pure; no network). */
  buildOutboundCall(req: OutboundCallRequest): ProviderHttpRequest;
  /** Place the call. The demo build simulates this instead of sending. */
  placeCall(req: OutboundCallRequest): Promise<PlacedCall>;
  hangUp(providerCallId: string): Promise<void>;
}

export interface DialerSettings {
  caller_id: string;
  numbers: string[];
  dial_mode: DialMode;
  record_calls: boolean;
  local_presence: boolean;
  auto_log_calls: boolean;
  agent_extension: string;
}
