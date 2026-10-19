// Shared option lists + helpers for campaign forms and phone parsing.
// campaigns.country stores an ISO 3166-1 alpha-2 code ("GB", "US", ...).

export const COUNTRIES: { value: string; label: string }[] = [
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "IE", label: "Ireland" },
  { value: "AU", label: "Australia" },
  { value: "PK", label: "Pakistan" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "IN", label: "India" },
];

export const VERTICALS: { value: string; label: string }[] = [
  { value: "home_improvement", label: "Home improvement" },
  { value: "home_services", label: "Home services" },
  { value: "solar", label: "Solar / energy" },
  { value: "financial", label: "Financial services" },
  { value: "digital_marketing", label: "Digital marketing" },
  { value: "construction", label: "Construction" },
  { value: "general", label: "General" },
];

export const TIMEZONES: string[] = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
];

// Region code libphonenumber-js should assume for a local-format number in
// this campaign. Accepts the legacy "UK" spelling too.
export function countryToRegion(country: string | null | undefined): string {
  const c = (country ?? "").trim().toUpperCase();
  if (c === "UK") return "GB";
  return /^[A-Z]{2}$/.test(c) ? c : "GB";
}

export function countryLabel(country: string | null | undefined): string {
  const code = countryToRegion(country);
  return COUNTRIES.find((c) => c.value === code)?.label ?? code;
}

// Postgres `time` comes back as "HH:MM:SS"; <input type="time"> wants "HH:MM".
export function toTimeInput(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}
