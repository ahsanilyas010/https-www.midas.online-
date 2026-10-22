// The IANA time zones a person can be set to. A free-text zone once let
// someone type "UK", which crashed the header clock for that account, so every
// write is checked with isValidTimezone() (the browser/Node's own zone list).

const FALLBACK = [
  "Asia/Karachi",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

let cache: string[] | null = null;

export function allTimezones(): string[] {
  if (cache) return cache;
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  if (list.length === 0) list = FALLBACK;
  cache = Array.from(new Set([...list, "UTC"])).sort();
  return cache;
}

export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
