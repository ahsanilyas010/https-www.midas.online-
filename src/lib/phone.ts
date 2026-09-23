// Campaign markets (campaigns.market: "UK" | "US" | "PK" | "OTHER") aren't
// the same vocabulary libphonenumber-js expects (ISO 3166-1 alpha-2, so
// "UK" is actually "GB") — this is the one place that translation happens,
// so every phone-parsing entry point (CSV import, manual add) defaults to
// the right region instead of hardcoding GB/US.
export function marketToCountryHint(market: string | null | undefined): string {
  switch (market) {
    case "UK":
      return "GB";
    case "US":
      return "US";
    case "PK":
      return "PK";
    default:
      return "GB";
  }
}
