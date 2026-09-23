// Section 4.2 — vertical/market presets. Applied at creation, all
// overridable, all logged when overridden (campaigns.vertical_preset_overridden).

export interface CampaignPreset {
  riskTier: "standard" | "elevated" | "high";
  requiresTps: boolean;
  requiresCtps: boolean;
  requiresUsDnc: boolean;
  screeningMaxAgeDays: number;
  note: string;
}

const DEFAULT: CampaignPreset = {
  riskTier: "standard",
  requiresTps: false,
  requiresCtps: false,
  requiresUsDnc: false,
  screeningMaxAgeDays: 28,
  note: "",
};

type Key = `${string}:${string}`; // `${vertical}:${market}`

export const CAMPAIGN_PRESETS: Record<Key, CampaignPreset> = {
  "home_improvement:UK": {
    riskTier: "high",
    requiresTps: true,
    requiresCtps: false,
    requiresUsDnc: false,
    screeningMaxAgeDays: 28,
    note: "The ICO's most-fined category. Mandatory QA review on 10% of calls, not 5%.",
  },
  "home_improvement:US": {
    riskTier: "high",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: true,
    screeningMaxAgeDays: 31,
    note: "State calling windows are narrower than federal in several states.",
  },
  "digital_marketing:UK": {
    riskTier: "standard",
    requiresTps: false,
    requiresCtps: true,
    requiresUsDnc: false,
    screeningMaxAgeDays: 28,
    note: "Legitimate interest with an LIA on file. Lower exposure, still screened.",
  },
  "digital_marketing:US": {
    riskTier: "standard",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: false,
    screeningMaxAgeDays: 31,
    note: "Business lines exempt from National DNC — do not assume B2B is unregulated.",
  },
  "financial:UK": {
    riskTier: "high",
    requiresTps: true,
    requiresCtps: true,
    requiresUsDnc: false,
    screeningMaxAgeDays: 28,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "financial:US": {
    riskTier: "high",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: true,
    screeningMaxAgeDays: 31,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "insurance:UK": {
    riskTier: "high",
    requiresTps: true,
    requiresCtps: true,
    requiresUsDnc: false,
    screeningMaxAgeDays: 28,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "insurance:US": {
    riskTier: "high",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: true,
    screeningMaxAgeDays: 31,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "utilities_energy:UK": {
    riskTier: "high",
    requiresTps: true,
    requiresCtps: true,
    requiresUsDnc: false,
    screeningMaxAgeDays: 28,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "utilities_energy:US": {
    riskTier: "high",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: true,
    screeningMaxAgeDays: 31,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "healthcare:UK": {
    riskTier: "high",
    requiresTps: true,
    requiresCtps: true,
    requiresUsDnc: false,
    screeningMaxAgeDays: 28,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "healthcare:US": {
    riskTier: "high",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: true,
    screeningMaxAgeDays: 31,
    note: "Additional sectoral rules. Get client's counsel involved before launch.",
  },
  "customer_service:UK": {
    riskTier: "standard",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: false,
    screeningMaxAgeDays: 28,
    note: "Not direct marketing — the suppression gate can be relaxed per campaign flag.",
  },
  "customer_service:US": {
    riskTier: "standard",
    requiresTps: false,
    requiresCtps: false,
    requiresUsDnc: false,
    screeningMaxAgeDays: 31,
    note: "Not direct marketing — the suppression gate can be relaxed per campaign flag.",
  },
};

export function presetFor(vertical: string, market: string): CampaignPreset {
  return CAMPAIGN_PRESETS[`${vertical}:${market}` as Key] ?? DEFAULT;
}

export const VERTICALS = [
  { value: "home_improvement", label: "Home improvement" },
  { value: "digital_marketing", label: "Digital marketing" },
  { value: "financial", label: "Financial" },
  { value: "utilities_energy", label: "Utilities & energy" },
  { value: "insurance", label: "Insurance" },
  { value: "healthcare", label: "Healthcare" },
  { value: "lead_qualification", label: "Lead qualification" },
  { value: "customer_service", label: "Customer service" },
  { value: "general", label: "General" },
];

export const MARKETS = [
  { value: "UK", label: "United Kingdom" },
  { value: "US", label: "United States" },
  { value: "PK", label: "Pakistan" },
  { value: "OTHER", label: "Other" },
];
