import "server-only";
import type { ZoomCredentials } from "./credentials";

// Base URLs are overridable so tests can point at a local mock server.
const oauthBase = () => (process.env.ZOOM_OAUTH_BASE || "https://zoom.us").replace(/\/$/, "");
const apiBase = () => (process.env.ZOOM_API_BASE || "https://api.zoom.us/v2").replace(/\/$/, "");

export type ZoomErrorCode = "not_connected" | "auth" | "user_not_found" | "scope" | "api";

export class ZoomError extends Error {
  constructor(
    public code: ZoomErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
  secretFingerprint: string;
}
// Per-workspace in-memory cache. Refreshed ~1 minute before expiry.
const tokenCache = new Map<string, CachedToken>();

export function clearZoomTokenCache(workspaceId?: string) {
  if (workspaceId) tokenCache.delete(workspaceId);
  else tokenCache.clear();
}

export async function getZoomAccessToken(creds: ZoomCredentials, force = false): Promise<string> {
  const fingerprint = `${creds.accountId}:${creds.clientId}:${creds.clientSecret.length}:${creds.clientSecret.slice(-4)}`;
  const cached = tokenCache.get(creds.workspaceId);
  if (!force && cached && cached.secretFingerprint === fingerprint && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token;
  }
  const url = `${oauthBase()}/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cache: "no-store",
    });
  } catch {
    throw new ZoomError("api", "Could not reach Zoom. Try again in a moment.");
  }
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; reason?: string; error?: string };
  if (!res.ok || !body.access_token) {
    tokenCache.delete(creds.workspaceId);
    const why = body.reason || body.error || `HTTP ${res.status}`;
    throw new ZoomError("auth", `Zoom rejected the credentials (${why}). Check the Account ID, Client ID and Client Secret, and that the app is activated.`, res.status);
  }
  tokenCache.set(creds.workspaceId, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    secretFingerprint: fingerprint,
  });
  return body.access_token;
}

async function zoomFetch<T>(creds: ZoomCredentials, method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const token = await getZoomAccessToken(creds, retried);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ZoomError("api", "Could not reach Zoom. Try again in a moment.");
  }
  if (res.status === 401 && !retried) {
    tokenCache.delete(creds.workspaceId);
    return zoomFetch<T>(creds, method, path, body, true);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { code?: number; message?: string } & Record<string, unknown>;
  if (!res.ok) {
    const msg = json.message || `Zoom returned HTTP ${res.status}`;
    if (res.status === 404 && (json.code === 1001 || /user/i.test(msg) && /not exist|not found/i.test(msg))) {
      throw new ZoomError("user_not_found", msg, 404);
    }
    if (res.status === 401 || res.status === 403 || /scope/i.test(msg)) {
      throw new ZoomError("scope", `${msg} Check the app's scopes in the Zoom Marketplace.`, res.status);
    }
    throw new ZoomError("api", msg, res.status);
  }
  return json as T;
}

export interface ZoomMeetingResult {
  id: number | string;
  join_url: string;
  start_url?: string;
  password?: string;
  topic?: string;
}

export interface CreateMeetingInput {
  hostEmail: string;
  topic: string;
  /** null = instant meeting (type 1) */
  startTime: Date | null;
  durationMinutes: number;
  timezone: string;
  agenda?: string | null;
  autoRecording?: "none" | "local" | "cloud";
}

function zoomDate(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function createMeeting(creds: ZoomCredentials, input: CreateMeetingInput): Promise<ZoomMeetingResult> {
  const instant = input.startTime === null;
  return zoomFetch<ZoomMeetingResult>(creds, "POST", `/users/${encodeURIComponent(input.hostEmail)}/meetings`, {
    topic: input.topic,
    type: instant ? 1 : 2,
    ...(instant ? {} : { start_time: zoomDate(input.startTime!), timezone: input.timezone }),
    duration: input.durationMinutes,
    agenda: input.agenda ?? undefined,
    settings: {
      join_before_host: true,
      waiting_room: false,
      auto_recording: input.autoRecording ?? "none",
    },
  });
}

// Fresh start_url (host-only bearer link; expires, so never stored).
export async function getMeeting(creds: ZoomCredentials, meetingId: string): Promise<ZoomMeetingResult> {
  return zoomFetch<ZoomMeetingResult>(creds, "GET", `/meetings/${encodeURIComponent(meetingId)}`);
}

export async function deleteMeeting(creds: ZoomCredentials, meetingId: string): Promise<void> {
  try {
    await zoomFetch<void>(creds, "DELETE", `/meetings/${encodeURIComponent(meetingId)}`);
  } catch (e) {
    // Already gone in Zoom: treat as cancelled.
    if (e instanceof ZoomError && e.status === 404) return;
    throw e;
  }
}

export interface ZoomVerifyResult {
  email: string | null;
  accountId: string | null;
}

// Verification = fetch a token, then call GET /users/me (needs
// user:read:user:admin). For an S2S app "me" resolves to the app owner.
export async function verifyZoomCredentials(creds: ZoomCredentials): Promise<ZoomVerifyResult> {
  await getZoomAccessToken(creds, true);
  const me = await zoomFetch<{ email?: string; account_id?: string }>(creds, "GET", "/users/me");
  return { email: me.email ?? null, accountId: me.account_id ?? null };
}
