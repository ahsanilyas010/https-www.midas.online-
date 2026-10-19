// Field-name tolerance for the inbound lead webhook. Zapier, Apollo and Clay
// each name their columns differently ("First Name", "work_email",
// "organization_name", "direct_phone", ...), and Zapier sends everything as a
// string (even `true`). This maps the common spellings onto one canonical
// shape and keeps everything it does not recognise in `custom`.
//
// Pure functions (no I/O) so the connector page, the dry-run action, the
// route and the proof script all share exactly the same behaviour.

type Scalar = string | number | boolean;

export interface NormalizedInbound {
  campaign?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
  job_title?: string;
  linkedin_url?: string;
  address_line1?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
  source?: string;
  consent?: boolean;
  consent_text?: string;
}

export interface NormalizeResult {
  fields: NormalizedInbound;
  custom: Record<string, Scalar>;
  // Incoming keys that mapped onto a LeadCallient field (for the dry run).
  mapped: Record<string, string>;
  // Incoming keys kept in `custom`.
  unmapped: string[];
  honeypot: boolean;
  dryRun: boolean;
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

// canonical field -> accepted (normalised) spellings, highest priority first.
const ALIASES: Record<string, string[]> = {
  campaign: ["campaignid", "campaigncode", "campaign", "campaignname"],
  phone: [
    "phone",
    "phonenumber",
    "mobile",
    "mobilephone",
    "mobilenumber",
    "directphone",
    "directdial",
    "sanitizedphone",
    "primaryphone",
    "cell",
    "cellphone",
    "telephone",
    "tel",
    "workphone",
    "corporatephone",
  ],
  first_name: ["firstname", "givenname", "fname"],
  last_name: ["lastname", "surname", "familyname", "lname"],
  full_name: ["name", "fullname", "contactname", "personname"],
  email: ["email", "workemail", "emailaddress", "personalemail", "businessemail"],
  company_name: ["company", "companyname", "organization", "organizationname", "organisation", "organisationname", "org", "account", "accountname"],
  job_title: ["title", "jobtitle", "position", "role", "headline"],
  linkedin_url: ["linkedinurl", "linkedin", "linkedinprofile", "linkedinprofileurl", "personlinkedinurl"],
  address_line1: ["address", "addressline1", "address1", "street", "streetaddress"],
  city: ["city", "town"],
  region: ["state", "region", "province", "county", "stateprovince"],
  postcode: ["postcode", "postalcode", "zip", "zipcode", "postal"],
  country: ["country", "countrycode"],
  source: ["source", "leadsource", "connector"],
  consent: ["consent", "consentgiven", "optin", "optedin"],
  consent_text: ["consenttext", "consentstatement", "consentwording"],
};

const LOOKUP = new Map<string, string>();
for (const [field, names] of Object.entries(ALIASES)) names.forEach((n, i) => LOOKUP.set(n, `${field}:${i}`));

// Object-valued keys whose children are flattened (lower priority than a
// top-level key of the same name). Company-ish objects are prefixed so their
// "name" does not clash with the person's name.
const PERSON_CONTAINERS = new Set(["person", "contact", "lead", "data", "fields", "record", "prospect"]);
const ORG_CONTAINERS = new Set(["organization", "organisation", "company", "account"]);

const HONEYPOTS = new Set(["honeypot", "hp", "gotcha", "hpwebsite", "botfield"]);
const DRYRUN_KEYS = new Set(["dryrun"]);

function toScalar(v: unknown): Scalar | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? undefined : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (Array.isArray(v)) {
    const first = v.map(toScalar).find((x) => x !== undefined);
    return first;
  }
  try {
    const s = JSON.stringify(v);
    return s && s !== "{}" ? s : undefined;
  } catch {
    return undefined;
  }
}

const TRUTHY = new Set(["true", "yes", "y", "1", "on", "checked", "t"]);
export function truthy(v: unknown): boolean {
  if (v === true || v === 1) return true;
  return typeof v === "string" && TRUTHY.has(v.trim().toLowerCase());
}

export function cleanSource(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_.-]{0,39}$/.test(s) ? s : undefined;
}

export function normalizeInbound(raw: Record<string, unknown>): NormalizeResult {
  type Candidate = { rank: number; value: Scalar; key: string };
  const best = new Map<string, Candidate>();
  const custom: Record<string, Scalar> = {};
  const mapped: Record<string, string> = {};
  const unmapped: string[] = [];
  let honeypot = false;
  let dryRun = false;

  const consider = (key: string, value: unknown, prefix: string, depthPenalty: number) => {
    const nk = prefix + norm(key);
    const v = toScalar(value);
    if (v === undefined) return;
    const hit = LOOKUP.get(nk);
    if (hit) {
      const [field, idx] = hit.split(":");
      const rank = depthPenalty * 100 + Number(idx);
      const cur = best.get(field);
      if (!cur || rank < cur.rank) best.set(field, { rank, value: v, key });
      return;
    }
    if (HONEYPOTS.has(nk) && String(v).trim() !== "") honeypot = true;
    if (DRYRUN_KEYS.has(nk)) {
      dryRun = truthy(v);
      return;
    }
    if (HONEYPOTS.has(nk)) return;
    if (Object.keys(custom).length < 40) {
      const ck = key.trim().slice(0, 60) || "field";
      if (!(ck in custom)) {
        custom[ck] = typeof v === "string" ? v.slice(0, 1000) : v;
        unmapped.push(prefix ? `${prefix}.${key}` : key);
      }
    }
  };

  for (const [key, value] of Object.entries(raw)) {
    const nk = norm(key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const isOrg = ORG_CONTAINERS.has(nk);
      const isPerson = PERSON_CONTAINERS.has(nk);
      if (isOrg || isPerson) {
        for (const [ck, cv] of Object.entries(value as Record<string, unknown>)) {
          if (cv && typeof cv === "object" && !Array.isArray(cv)) continue;
          consider(ck, cv, isOrg ? "organization" : "", 1);
        }
        continue;
      }
    }
    consider(key, value, "", 0);
  }

  const f = (field: string): string | undefined => {
    const c = best.get(field);
    return c === undefined ? undefined : String(c.value).trim() || undefined;
  };
  for (const [field, c] of best) mapped[c.key] = field;

  const fields: NormalizedInbound = {
    campaign: f("campaign"),
    phone: f("phone"),
    first_name: f("first_name"),
    last_name: f("last_name"),
    email: f("email"),
    company_name: f("company_name"),
    job_title: f("job_title"),
    linkedin_url: f("linkedin_url"),
    address_line1: f("address_line1"),
    city: f("city"),
    region: f("region"),
    postcode: f("postcode"),
    country: f("country"),
    source: cleanSource(f("source")),
    consent: best.has("consent") ? truthy(best.get("consent")!.value) : undefined,
    consent_text: f("consent_text"),
  };

  const full = f("full_name");
  if (full && !fields.first_name && !fields.last_name) {
    const parts = full.split(/\s+/);
    fields.first_name = parts.shift();
    fields.last_name = parts.join(" ") || undefined;
  }
  for (const k of ["first_name", "last_name", "company_name", "job_title", "city", "region"] as const) {
    if (fields[k]) fields[k] = fields[k]!.slice(0, k === "company_name" || k === "job_title" ? 120 : 80);
  }

  return { fields, custom, mapped, unmapped, honeypot, dryRun };
}

// Country names / aliases (Apollo and Clay send "United States", not "US").
const COUNTRY_NAMES: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  america: "US",
  "united kingdom": "GB",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  canada: "CA",
  ireland: "IE",
  australia: "AU",
  pakistan: "PK",
  "united arab emirates": "AE",
  uae: "AE",
  india: "IN",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  netherlands: "NL",
  "new zealand": "NZ",
  "south africa": "ZA",
};

export function resolveCountry(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase() === "UK" ? "GB" : s.toUpperCase();
  return COUNTRY_NAMES[s.toLowerCase()];
}

export function phoneLast4(phone: string | undefined | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 4 ? d.slice(-4) : d || null;
}

// Phone numbers are masked in everything shown back to the user.
export function maskPhone(phone: string | undefined | null): string | null {
  const l = phoneLast4(phone);
  return l ? `***${l}` : null;
}
