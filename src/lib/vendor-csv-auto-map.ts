// Best-effort auto-mapping from a vendor file's own column headers to the
// lead fields the import dialog needs. Runs client-side against whatever
// headers SheetJS found — never guesses at *content*, only header text —
// so a wrong guess here is exactly as visible and correctable as a manual
// pick: it just pre-fills the same dropdown, it doesn't skip it.
//
// Field order is significant, not just cosmetic: fields with longer/more
// specific header phrases ("Contact Name & Address", "Decision Date")
// must get first claim on a header before shorter, more generic fields
// ("Address", "Decision", "Name") are allowed to grab it via their own
// loose match. See guessColumnMapping's used-header tracking.
interface FieldMatchRules {
  /** Tried first, against every field, header-exact ("phone" === "Phone"). */
  exact: string[];
  /** Tried only if no field found an exact match for this header — a
   * whole-word (not mid-word) match anywhere in the header text. Omit for
   * a keyword too generic to safely loose-match (e.g. bare "name" would
   * wrongly claim "Full Name" for the project-name field) — exact-only.
   */
  loose?: string[];
}

const FIELD_KEYWORDS: Record<string, FieldMatchRules> = {
  map_phone: {
    exact: ["phone number", "phone", "mobile number", "mobile", "cell", "cell phone", "telephone", "tel", "contact number", "msisdn"],
    loose: ["phone number", "phone", "mobile", "cell", "telephone", "tel", "msisdn"],
  },
  map_email: {
    exact: ["email address", "email", "e-mail", "e mail"],
    loose: ["email"],
  },
  map_external_ref: {
    exact: ["sr no", "sr number", "serial no", "serial number", "sl no", "external reference", "external ref", "external id", "reference", "ref", "id"],
    loose: ["sr no", "serial no", "external reference", "external id"],
  },
  // Combined free-text field — must be claimed before first/last name and
  // address, or its header gets shredded by those fields' own loose match
  // ("...name..." / "...address...").
  map_contact_name_address: {
    exact: ["contact name address", "contact name and address", "contact details"],
    loose: ["contact name address", "contact details"],
  },
  map_first_name: {
    exact: ["first name", "firstname", "given name", "forename", "fname"],
    loose: ["first name", "given name", "forename"],
  },
  map_last_name: {
    exact: ["last name", "lastname", "surname", "family name", "lname"],
    loose: ["last name", "surname", "family name"],
  },
  map_company_name: {
    exact: ["company name", "company", "organisation", "organization", "business name", "employer"],
    loose: ["company name", "company", "organisation", "organization", "business name"],
  },
  map_job_title: {
    exact: ["job title", "title", "position", "designation", "role"],
    loose: ["job title", "designation"],
  },
  map_address: {
    exact: ["address line 1", "address line1", "address1", "street address", "address", "street"],
    loose: ["address", "street"],
  },
  map_city: { exact: ["city", "town"], loose: ["city", "town"] },
  map_region: { exact: ["region", "state", "county", "province"], loose: ["region", "county", "province"] },
  map_postcode: { exact: ["postcode", "postal code", "zip code", "zip"], loose: ["postcode", "postal code", "zip"] },
  map_council: { exact: ["council", "borough"], loose: ["council"] },
  map_authority: { exact: ["authority", "local authority", "local planning authority", "lpa"], loose: ["authority"] },
  // Application Date / Application Type before the generic Decision Date /
  // project-type fields, same reasoning as contact_name_address.
  map_application_date: { exact: ["application date", "date received", "app date"], loose: ["application date"] },
  map_application_type: { exact: ["application type"], loose: ["application type"] },
  map_category: { exact: ["category"], loose: ["category"] },
  // Decision Date before Decision, same reasoning as contact_name_address.
  map_decision_date: { exact: ["decision date", "date of decision"], loose: ["decision date"] },
  map_decision: { exact: ["decision", "outcome", "status"], loose: ["decision"] },
  map_disposition: { exact: ["disposition", "prior disposition"], loose: ["disposition"] },
  map_project_type: { exact: ["project type", "development type"], loose: ["project type"] },
  map_units: { exact: ["units", "no of units", "number of units", "unit count"], loose: ["units"] },
  // Proposal before Summary — a header that literally says "Proposal"
  // should claim the dedicated field, not fall through to the more
  // generic summary/description one.
  map_proposal: { exact: ["proposal"], loose: ["proposal"] },
  map_summary: { exact: ["summary", "description"], loose: ["summary", "description"] },
  map_architect_name: { exact: ["architect name", "architect"], loose: ["architect"] },
  map_contact: { exact: ["contact", "contact person"] },
  map_portal_url: { exact: ["portal url", "portal link", "url", "link", "source url"], loose: ["portal url", "portal link"] },
  map_web: { exact: ["web", "website"], loose: ["web", "website"] },
  // Comments before the generic Notes field, same reasoning as Proposal.
  map_comments: { exact: ["comments"], loose: ["comments"] },
  map_source_notes: { exact: ["notes", "note", "remarks"], loose: ["notes", "remarks"] },
  // "name" alone is exact-only: it must not loose-match "Full Name" or
  // "Company Name" and steal them from the fields above, which is exactly
  // what happened before this field had a restricted keyword set. Only a
  // header that says literally "Name" (or one of the more specific
  // phrases) ends up here.
  map_project_name: {
    exact: ["name", "project name", "site name", "application name"],
    loose: ["project name", "site name", "application name"],
  },
};

const FIELD_PRIORITY = Object.keys(FIELD_KEYWORDS);

function normalise(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-.]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match, not raw substring — "position" as a keyword must
// not match inside "disposition". \b works here because normalise()
// already strips everything down to plain [a-z0-9 ].
function containsWord(haystack: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(haystack);
}

export function guessColumnMapping(headers: string[]): Record<string, string> {
  const normalisedHeaders = headers.map((h) => ({ raw: h, normalised: normalise(h) }));
  const used = new Set<string>();
  const mapping: Record<string, string> = {};

  // Pass 1: exact header match, across all fields in priority order —
  // this must fully complete before any field's loose pass runs, so an
  // exact match anywhere always wins over a looser match elsewhere.
  for (const fieldKey of FIELD_PRIORITY) {
    const { exact } = FIELD_KEYWORDS[fieldKey];
    const match = normalisedHeaders.find((h) => !used.has(h.raw) && exact.includes(h.normalised));
    if (match) {
      mapping[fieldKey] = match.raw;
      used.add(match.raw);
    }
  }

  // Pass 2: whole-word loose match for whatever's left.
  for (const fieldKey of FIELD_PRIORITY) {
    if (mapping[fieldKey]) continue;
    const { loose } = FIELD_KEYWORDS[fieldKey];
    if (!loose) continue;
    const match = normalisedHeaders.find(
      (h) => !used.has(h.raw) && loose.some((k) => containsWord(h.normalised, k)),
    );
    if (match) {
      mapping[fieldKey] = match.raw;
      used.add(match.raw);
    }
  }

  return mapping;
}
