import "server-only";
import { randomInt } from "crypto";

// Zoom integration (demo build). Meetings are created locally with
// realistic Zoom-style meeting numbers, join links and passcodes, and are
// "started" in the in-app meeting simulator. No Zoom account, API keys or
// environment variables are needed.

export interface ZoomMeetingInput {
  topic: string;
  startTime: string; // ISO 8601
  durationMinutes: number;
  timezone: string;
  agenda?: string;
  inviteeEmail?: string | null;
  autoRecording?: "cloud" | "local" | "none";
  waitingRoom?: boolean;
  /** Instant meeting instead of scheduled. */
  instant?: boolean;
}

export interface ZoomMeetingCreated {
  zoomMeetingId: string;
  joinUrl: string;
  startUrl: string;
  password: string;
  source: "demo";
}

export async function createZoomMeeting(input: ZoomMeetingInput): Promise<ZoomMeetingCreated> {
  void input;
  const id = String(8_100_000_000 + randomInt(1_000_000, 99_999_999));
  const pwd = Math.random().toString(36).slice(2, 10);
  return {
    zoomMeetingId: id,
    joinUrl: `https://zoom.us/j/${id}?pwd=${pwd}`,
    startUrl: `https://zoom.us/s/${id}?zak=demo`,
    password: String(randomInt(100000, 999999)),
    source: "demo",
  };
}

export async function deleteZoomMeeting(zoomMeetingId: string, source: string) {
  void zoomMeetingId;
  void source;
  // Nothing to call in the demo build — the meeting only exists locally.
}
