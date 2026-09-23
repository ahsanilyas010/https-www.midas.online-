// Deterministic demo dataset. Everything is generated relative to "now" so
// the dashboards always look live: agents are clocked in today, calls were
// made this morning, callbacks are due in the next hour, and so on.
//
// IDs for people/clients/campaigns are fixed so a demo login cookie keeps
// working across a data reset.

import type { DemoStore, Row } from "./store";

// ---------- deterministic helpers ----------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fixedId(group: number, n: number) {
  const g = group.toString(16).padStart(4, "0");
  const s = n.toString(16).padStart(12, "0");
  return `dea0${g}-0000-4000-8000-${s}`;
}

let counter = 0;
function genId() {
  counter++;
  return fixedId(0xffff, counter);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function iso(ms: number) {
  return new Date(ms).toISOString();
}

function dateOnly(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------- fixed identities ----------

export const DEMO_IDS = {
  admin: fixedId(1, 1),
  ops: fixedId(1, 2),
  leadFalcons: fixedId(1, 3),
  leadEagles: fixedId(1, 4),
  qa: fixedId(1, 5),
  client: fixedId(1, 6),
  agents: [11, 12, 13, 14, 15, 16, 17, 18].map((n) => fixedId(1, n)),
  teamFalcons: fixedId(2, 1),
  teamEagles: fixedId(2, 2),
  clients: [1, 2, 3, 4].map((n) => fixedId(3, n)),
  campaigns: [1, 2, 3, 4].map((n) => fixedId(4, n)),
};

// Every demo account — one per person on the People page — signs in with
// this same password.
export const DEMO_PASSWORD = "CallMilalo@123";

export interface DemoPersona {
  id: string;
  email: string;
  role: string;
  title: string;
  blurb: string;
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: DEMO_IDS.admin,
    email: "admin@callmilalo.demo",
    role: "super_admin",
    title: "Super admin",
    blurb: "Full control: live floor, campaigns, people, compliance, Zoom and audit.",
  },
  {
    id: DEMO_IDS.ops,
    email: "ops@callmilalo.demo",
    role: "ops_manager",
    title: "Operations manager",
    blurb: "Runs campaigns, assigns data, approves leave and tracks performance.",
  },
  {
    id: DEMO_IDS.leadFalcons,
    email: "teamlead@callmilalo.demo",
    role: "team_lead",
    title: "Team lead",
    blurb: "Watches the live floor and coaches their team.",
  },
  {
    id: DEMO_IDS.agents[0],
    email: "agent@callmilalo.demo",
    role: "agent",
    title: "Calling agent",
    blurb: "Dials leads, logs outcomes, books Zoom meetings and manages callbacks.",
  },
  {
    id: DEMO_IDS.qa,
    email: "qa@callmilalo.demo",
    role: "qa",
    title: "Quality analyst",
    blurb: "Scores recorded calls against the QA scorecard.",
  },
  {
    id: DEMO_IDS.client,
    email: "client@callmilalo.demo",
    role: "client_viewer",
    title: "Client viewer",
    blurb: "Read-only client portal: funnel, outcomes, agent activity and reports.",
  },
];

// ---------- static reference data ----------

const FIRST = [
  "Oliver", "Amelia", "George", "Isla", "Harry", "Ava", "Jack", "Mia", "Noah", "Grace",
  "Leo", "Freya", "Oscar", "Lily", "Charlie", "Emily", "Thomas", "Sophie", "James", "Chloe",
  "William", "Ella", "Henry", "Ruby", "Arthur", "Evie", "Alfie", "Poppy", "Jacob", "Daisy",
  "Michael", "Sarah", "David", "Jessica", "Daniel", "Hannah", "Robert", "Laura", "Ethan", "Megan",
];
const LAST = [
  "Smith", "Jones", "Taylor", "Brown", "Williams", "Wilson", "Johnson", "Davies", "Patel", "Robinson",
  "Wright", "Thompson", "Evans", "Walker", "White", "Roberts", "Green", "Hall", "Wood", "Jackson",
  "Clarke", "Hughes", "Edwards", "Turner", "Harris", "Lewis", "Carter", "Mitchell", "Baker", "Cooper",
];
const COMPANY_A = ["Apex", "Bluebird", "Crown", "Summit", "Harbour", "Oakridge", "Kingsway", "Silverline", "Northgate", "Riverside", "Evergreen", "Beacon", "Granite", "Meridian", "Horizon"];
const COMPANY_B = ["Builders", "Developments", "Homes", "Construction", "Properties", "Estates", "Contractors", "Group", "Partners", "Holdings"];
const UK_CITIES: [string, string, string][] = [
  ["Manchester", "Greater Manchester", "M1"], ["Leeds", "West Yorkshire", "LS1"], ["Bristol", "Bristol", "BS1"],
  ["Birmingham", "West Midlands", "B1"], ["Liverpool", "Merseyside", "L1"], ["Sheffield", "South Yorkshire", "S1"],
  ["Nottingham", "Nottinghamshire", "NG1"], ["Reading", "Berkshire", "RG1"], ["Brighton", "East Sussex", "BN1"],
  ["Cambridge", "Cambridgeshire", "CB1"], ["Oxford", "Oxfordshire", "OX1"], ["York", "North Yorkshire", "YO1"],
];
const US_CITIES: [string, string, string][] = [
  ["Austin", "TX", "73301"], ["Tampa", "FL", "33601"], ["Phoenix", "AZ", "85001"], ["Denver", "CO", "80201"],
  ["Charlotte", "NC", "28201"], ["Columbus", "OH", "43085"], ["Atlanta", "GA", "30301"], ["Nashville", "TN", "37201"],
];
const STREETS = ["High Street", "Station Road", "Church Lane", "Victoria Road", "Mill Lane", "Park Avenue", "Kings Road", "Queen Street"];
const JOB_TITLES = ["Director", "Operations Manager", "Owner", "Head of Marketing", "Project Manager", "Managing Director", "Office Manager", "Homeowner"];

// Global dispositions — mirrors migrations 010 and 030 exactly.
const DISPOSITIONS: [string, string, string, boolean, boolean, boolean, boolean, number][] = [
  // code, label, category, is_terminal, sets_dnc, requires_followup, requires_note, sort
  ["connected_interested", "Connected — Interested", "connected_positive", false, false, true, false, 10],
  ["connected_callback", "Connected — Callback Requested", "connected_neutral", false, false, true, false, 20],
  ["connected_not_interested", "Connected — Not Interested", "connected_negative", true, false, false, false, 30],
  ["connected_dnc", "Connected — Do Not Call", "compliance", true, true, false, true, 40],
  ["connected_wrong_person", "Connected — Wrong Person", "connected_neutral", true, false, false, false, 50],
  ["connected_wrong_number", "Connected — Wrong Number", "invalid", true, false, false, false, 60],
  ["connected_gatekeeper", "Connected — Gatekeeper", "connected_neutral", false, false, false, false, 70],
  ["no_answer", "No Answer", "no_contact", false, false, false, false, 80],
  ["busy", "Busy", "no_contact", false, false, false, false, 90],
  ["voicemail", "Voicemail", "no_contact", false, false, false, false, 100],
  ["invalid_number", "Invalid Number", "invalid", true, false, false, false, 110],
  ["language_barrier", "Language Barrier", "connected_neutral", true, false, false, false, 120],
  ["already_customer", "Already a Customer", "connected_neutral", true, false, false, false, 130],
  ["outside_calling_hours", "Outside Calling Hours", "compliance", true, false, false, true, 140],
  ["project_finished", "Project Finished", "connected_negative", true, false, false, false, 150],
  ["answering_machine", "Answering Machine", "no_contact", false, false, false, false, 160],
  ["number_busy", "Number Busy", "no_contact", false, false, false, false, 170],
  ["schedule_callback", "Schedule Call Back", "connected_neutral", false, false, true, false, 180],
  ["dead_air", "Dead Air", "invalid", false, false, false, false, 190],
  ["do_not_call", "Do Not Call", "compliance", true, true, false, true, 200],
  ["not_interested", "Not Interested", "connected_negative", true, false, false, false, 210],
  ["hang_up", "Hang Up", "connected_negative", true, false, false, false, 220],
  ["appointment_set", "Appointment set", "connected_positive", true, false, true, false, 230],
  ["not_available", "Not Available", "no_contact", false, false, false, false, 240],
  ["email_sent_no_call", "Email Sent/ No call", "no_contact", false, false, false, false, 250],
  ["email_sent_and_called", "Email Sent and Called", "connected_neutral", false, false, false, false, 260],
  ["interested_follow_up", "Interested-Follow up", "connected_positive", false, false, true, false, 270],
  ["number_disconnected", "Number Disconnected", "invalid", true, false, false, false, 280],
  ["wrong_person", "wrong person", "connected_neutral", true, false, false, false, 290],
  ["already_have_team", "already have team", "connected_negative", true, false, false, false, 300],
];

const SCRIPT_ROOFING = `### Opening
Hi, is that **{first_name}**? It's {agent} calling from Northwind Roofing — we're doing free roof health checks in **{city}** this month.

### Qualify
1. Do you own the property?
2. When was the roof last inspected?
3. Any leaks, missing tiles or damp patches?

### Close
Great — I can book a surveyor for a **free 20-minute inspection**. Would a weekday morning or afternoon suit better? I can also set up a quick **Zoom video call** so the surveyor can see photos first.`;

const SCRIPT_SOLAR = `### Opening
Hi {first_name}, this is {agent} from Solaris Home Energy. We're helping homeowners in {city} cut energy bills with solar + battery.

### Qualify
- Homeowner? South/east/west facing roof?
- Average monthly electricity bill?

### Close
Our energy advisor can walk you through your personalised savings on a **15-minute Zoom call** — shall I book that in?`;

const SCRIPT_INSURANCE = `### Opening (US — disclosure required)
Hi {first_name}, my name is {agent}, calling on behalf of Brightpath Insurance. This call may be recorded for quality purposes.

### Qualify
- Are you currently enrolled in Medicare Part A and B?
- Do you have a supplement plan today?

### Close
A licensed advisor can review plan options with you — I can transfer now or book a **Zoom consultation**.`;

const SCRIPT_SEO = `### Opening
Hi {first_name}, {agent} here from Crescent Digital. Quick one — I noticed {company} ranks on page 3 for a few of your core services.

### Discovery
- Who handles your website and SEO today?
- What's your main source of new enquiries?

### Close
Could I book a **20-minute Zoom audit** with our strategist to show you the three quickest wins?`;

const OBJECTIONS = `**"I'm busy right now"** — Totally understand. When's a better time for a 2-minute call back?

**"Send me an email"** — Happy to. I'll send a short summary — can I also pencil in a quick Zoom call so you can ask questions?

**"Not interested"** — No problem at all. Just so I don't call again, is that because it's been handled already?`;

// ---------- the seed ----------

export function buildSeed(): DemoStore {
  counter = 0;
  const rnd = mulberry32(20260923);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const int = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
  const now = Date.now();
  const today = dateOnly(now);
  const startOfToday = new Date(today + "T00:00:00Z").getTime();

  const t: Record<string, Row[]> = {};
  const table = (name: string) => (t[name] ??= []);

  // --- teams & people ---
  table("teams").push(
    { id: DEMO_IDS.teamFalcons, name: "Falcons", team_lead_id: DEMO_IDS.leadFalcons, created_at: iso(now - 200 * DAY) },
    { id: DEMO_IDS.teamEagles, name: "Eagles", team_lead_id: DEMO_IDS.leadEagles, created_at: iso(now - 180 * DAY) },
  );

  const person = (
    id: string,
    full_name: string,
    role: string,
    extra: Row = {},
  ): Row => ({
    id,
    full_name,
    role,
    agent_code: null,
    team_id: null,
    client_id: null,
    phone: null,
    timezone: "Asia/Karachi",
    is_active: true,
    must_change_password: false,
    allow_login_outside_shift: role !== "agent",
    failed_login_count: 0,
    locked_until: null,
    last_login_at: iso(now - int(1, 30) * HOUR),
    last_login_ip: "203.0.113." + int(2, 250),
    password_set_at: iso(now - 90 * DAY),
    totp_enabled: role === "super_admin",
    joined_on: dateOnly(now - int(60, 700) * DAY),
    created_at: iso(now - 200 * DAY),
    updated_at: iso(now - 5 * DAY),
    ...extra,
  });

  const AGENT_NAMES = [
    "Usman Tariq", "Zara Malik", "Hamza Raza", "Mariam Javed",
    "Ali Hassan", "Noor Fatima", "Saad Qureshi", "Iqra Shah",
  ];

  table("profiles").push(
    person(DEMO_IDS.admin, "Alex Morgan", "super_admin"),
    person(DEMO_IDS.ops, "Hira Khan", "ops_manager"),
    person(DEMO_IDS.leadFalcons, "Bilal Ahmed", "team_lead", { team_id: DEMO_IDS.teamFalcons, agent_code: "CM-TL1" }),
    person(DEMO_IDS.leadEagles, "Ayesha Siddiqui", "team_lead", { team_id: DEMO_IDS.teamEagles, agent_code: "CM-TL2" }),
    person(DEMO_IDS.qa, "Fatima Noor", "qa"),
    person(DEMO_IDS.client, "Oliver Bennett", "client_viewer", { client_id: DEMO_IDS.clients[0], timezone: "Europe/London" }),
    ...AGENT_NAMES.map((name, i) =>
      person(DEMO_IDS.agents[i], name, "agent", {
        agent_code: `CM-${101 + i}`,
        team_id: i < 4 ? DEMO_IDS.teamFalcons : DEMO_IDS.teamEagles,
      }),
    ),
    // One deactivated account so the People page shows the full lifecycle.
    person(fixedId(1, 30), "Kamran Butt", "agent", {
      agent_code: "CM-099",
      team_id: DEMO_IDS.teamEagles,
      is_active: false,
      last_login_at: iso(now - 40 * DAY),
    }),
  );

  // A login for every person on the People page: the persona emails above
  // for the headline roles, firstname@callmilalo.demo for everyone else.
  const personaEmail = new Map(DEMO_PERSONAS.map((p) => [p.id, p.email]));
  for (const p of table("profiles")) {
    const email = personaEmail.get(p.id as string) ?? `${String(p.full_name).split(" ")[0].toLowerCase()}@callmilalo.demo`;
    table("demo_auth").push({ id: p.id, email, password: DEMO_PASSWORD });
  }


  // --- clients & campaigns ---
  const clientDefs = [
    { name: "Northwind Roofing Ltd", country: "GB", contact_name: "Oliver Bennett", contact_email: "oliver@northwind-roofing.example", full_visibility: true },
    { name: "Solaris Home Energy", country: "GB", contact_name: "Priya Shah", contact_email: "priya@solaris-energy.example", full_visibility: false },
    { name: "Brightpath Insurance", country: "US", contact_name: "Megan Clark", contact_email: "megan@brightpath.example", full_visibility: false },
    { name: "Crescent Digital", country: "GB", contact_name: "Tom Hughes", contact_email: "tom@crescent-digital.example", full_visibility: true },
  ];
  clientDefs.forEach((c, i) =>
    table("clients").push({
      id: DEMO_IDS.clients[i],
      ...c,
      contract_ref: `MID-${2025 + (i % 2)}-${String(i + 7).padStart(3, "0")}`,
      dpa_signed_on: dateOnly(now - (120 + i * 30) * DAY),
      is_active: true,
      is_data_controller: true,
      notes: null,
      created_at: iso(now - (150 - i * 10) * DAY),
    }),
  );

  const campaignDefs = [
    { code: "NWR-UK", name: "Roof Health Check Appointments", market: "UK", vertical: "home_improvement", risk_tier: "high", audience: "b2c", tps: true, ctps: false, usdnc: false, script: SCRIPT_ROOFING, tz: "Europe/London" },
    { code: "SOL-UK", name: "Solar Savings Consultations", market: "UK", vertical: "home_improvement", risk_tier: "high", audience: "b2c", tps: true, ctps: false, usdnc: false, script: SCRIPT_SOLAR, tz: "Europe/London" },
    { code: "BPI-US", name: "Medicare Supplement Enquiries", market: "US", vertical: "insurance", risk_tier: "high", audience: "b2c", tps: false, ctps: false, usdnc: true, script: SCRIPT_INSURANCE, tz: "America/New_York" },
    { code: "CRD-UK", name: "B2B SEO Discovery Calls", market: "UK", vertical: "digital_marketing", risk_tier: "standard", audience: "b2b", tps: false, ctps: true, usdnc: false, script: SCRIPT_SEO, tz: "Europe/London" },
  ];
  campaignDefs.forEach((c, i) =>
    table("campaigns").push({
      id: DEMO_IDS.campaigns[i],
      client_id: DEMO_IDS.clients[i],
      code: c.code,
      name: c.name,
      market: c.market,
      vertical: c.vertical,
      vertical_preset_overridden: false,
      risk_tier: c.risk_tier,
      audience: c.audience,
      is_active: true,
      call_days: [1, 2, 3, 4, 5, 6],
      call_window_start: "09:00",
      call_window_end: "20:00",
      max_attempts: 6,
      min_hours_between_attempts: 4,
      screening_max_age_days: 28,
      requires_tps_screening: c.tps,
      requires_ctps_screening: c.ctps,
      requires_us_dnc_screening: c.usdnc,
      requires_offshore_disclosure: c.market === "UK",
      opening_disclosure:
        c.market === "UK"
          ? "I'm calling from our partner contact centre in Pakistan on behalf of the company named."
          : "This call may be recorded for quality and training purposes.",
      script_md: c.script,
      objection_handling_md: OBJECTIONS,
      dpa_reference: `DPA-${c.code}`,
      created_at: iso(now - (120 - i * 12) * DAY),
    }),
  );

  // Agents 0-3 (Falcons) work UK roofing + solar; 4-7 (Eagles) work US + SEO.
  const campaignAgents: string[][] = [
    [DEMO_IDS.agents[0], DEMO_IDS.agents[1], DEMO_IDS.agents[2]],
    [DEMO_IDS.agents[0], DEMO_IDS.agents[3], DEMO_IDS.agents[2]],
    [DEMO_IDS.agents[4], DEMO_IDS.agents[5], DEMO_IDS.agents[6]],
    [DEMO_IDS.agents[7], DEMO_IDS.agents[5], DEMO_IDS.agents[1]],
  ];
  campaignAgents.forEach((agents, ci) =>
    agents.forEach((user_id) =>
      table("campaign_assignments").push({
        campaign_id: DEMO_IDS.campaigns[ci],
        user_id,
        daily_target: pick([40, 50, 60]),
        created_at: iso(now - 60 * DAY),
      }),
    ),
  );

  // --- dispositions ---
  const dispoByCode = new Map<string, Row>();
  DISPOSITIONS.forEach(([code, label, category, is_terminal, sets_dnc, requires_followup, requires_note, sort_order], i) => {
    const row = {
      id: fixedId(5, i + 1),
      campaign_id: null,
      code,
      label,
      category,
      is_terminal,
      sets_dnc,
      requires_followup,
      requires_note,
      requires_email: false,
      colour: null,
      sort_order,
    };
    table("dispositions").push(row);
    dispoByCode.set(code, row);
  });

  // --- data sources & batches ---
  const dataSources = [
    { name: "Companies House — construction SIC codes", source_type: "public_register", lawful_basis: "legitimate_interest", market: "UK", config: { connector_key: "companies_house", default_params: { sic_codes: ["41202", "43910"] } }, provider_url: "https://find-and-update.company-information.service.gov.uk" },
    { name: "PlanIt — UK planning applications", source_type: "public_register", lawful_basis: "legitimate_interest", market: "UK", config: { connector_key: "uk_planning_planit" }, provider_url: "https://www.planit.org.uk" },
    { name: "LeadVault vendor list (Q3)", source_type: "vendor_list", lawful_basis: "consent", market: "UK", config: {}, provider_url: null },
    { name: "Brightpath inbound web form", source_type: "inbound_form", lawful_basis: "consent", market: "US", config: {}, provider_url: null },
    { name: "Socrata — Austin building permits", source_type: "public_register", lawful_basis: "legitimate_interest", market: "US", config: { connector_key: "us_permits_socrata", domain: "data.austintexas.gov", dataset_id: "3syk-w9eu" }, provider_url: "https://data.austintexas.gov" },
  ];
  dataSources.forEach((d, i) =>
    table("data_sources").push({
      id: fixedId(6, i + 1),
      ...d,
      is_active: true,
      licence_terms_url: null,
      lia_document_path: d.lawful_basis === "legitimate_interest" ? `lia/${d.config && (d.config as Row).connector_key}-lia.pdf` : null,
      notes: null,
      created_at: iso(now - (90 - i * 5) * DAY),
    }),
  );
  const campaignSource = [fixedId(6, 2), fixedId(6, 3), fixedId(6, 4), fixedId(6, 1)];

  DEMO_IDS.campaigns.forEach((cid, i) =>
    table("lead_batches").push({
      id: fixedId(7, i + 1),
      campaign_id: cid,
      data_source_id: campaignSource[i],
      acquired_at: iso(now - (30 - i) * DAY),
      original_filename: `${campaignDefs[i].code.toLowerCase()}-batch-01.csv`,
      rows_total: 110,
      rows_accepted: 90,
      rows_duplicate: 8,
      rows_rejected: 5,
      rows_suppressed: 7,
      status: "completed",
      column_mapping: null,
      storage_path: null,
      error_report_path: null,
      notes: null,
      uploaded_by: DEMO_IDS.ops,
      created_at: iso(now - (30 - i) * DAY),
    }),
  );

  // --- leads + call history ---
  const leads = table("leads");
  const attempts = table("call_attempts");
  const followups = table("followups");
  const suppression = table("suppression_list");

  const outcomeWeights: [string, number][] = [
    ["no_answer", 26], ["voicemail", 14], ["busy", 6], ["connected_callback", 10],
    ["connected_interested", 9], ["appointment_set", 6], ["connected_not_interested", 12],
    ["connected_gatekeeper", 5], ["interested_follow_up", 4], ["connected_wrong_person", 3],
    ["invalid_number", 2], ["connected_dnc", 1], ["hang_up", 2],
  ];
  const totalWeight = outcomeWeights.reduce((s, [, w]) => s + w, 0);
  const pickOutcome = () => {
    let r = rnd() * totalWeight;
    for (const [code, w] of outcomeWeights) {
      r -= w;
      if (r <= 0) return code;
    }
    return "no_answer";
  };

  const statusFor = (code: string): string => {
    const d = dispoByCode.get(code)!;
    if (d.sets_dnc) return "suppressed";
    if (code === "connected_interested" || code === "interested_follow_up") return "qualified";
    if (code === "appointment_set") return "converted";
    if (code === "connected_callback") return "callback";
    if (code === "connected_wrong_number" || code === "invalid_number") return "unreachable";
    if (d.is_terminal) return "rejected";
    return "in_progress";
  };

  // A call time on a given day offset (0 = today), within UK/US office hours
  // expressed in UTC, never in the future.
  const callTime = (dayOffset: number, market: string) => {
    const base = startOfToday - dayOffset * DAY;
    const startHour = market === "US" ? 14 : 8;
    let ms = base + (startHour + rnd() * 9) * HOUR;
    if (ms > now - 5 * MIN) ms = now - int(5, 180) * MIN;
    return ms;
  };

  DEMO_IDS.campaigns.forEach((campaignId, ci) => {
    const def = campaignDefs[ci];
    const agents = campaignAgents[ci];
    const perCampaign = 95;
    for (let n = 0; n < perCampaign; n++) {
      const id = fixedId(8, ci * 1000 + n + 1);
      const first = pick(FIRST);
      const last = pick(LAST);
      const isUS = def.market === "US";
      const [city, region, pc] = isUS ? pick(US_CITIES) : pick(UK_CITIES);
      const phone = isUS
        ? `+1${pick(["512", "813", "602", "303", "704", "614", "404", "615"])}${int(2000000, 9999999)}`
        : `+447${int(100000000, 999999999)}`;
      const company = def.audience === "b2b" ? `${pick(COMPANY_A)} ${pick(COMPANY_B)}` : null;
      const createdMs = now - int(3, 28) * DAY;
      const assigned = agents[n % agents.length];
      const screeningRoll = rnd();
      const screening_status = screeningRoll < 0.86 ? "passed" : screeningRoll < 0.93 ? "unscreened" : "expired";
      const custom: Row =
        def.audience === "b2b"
          ? { industry: pick(["Construction", "Legal", "Dental", "Accounting", "Hospitality"]), poc: `${first} ${last}`, crm_stage: pick(["Prospect", "Warm", "Discovery booked"]) }
          : ci === 0
            ? { project_type: pick(["Re-roof", "Repair", "Flat roof", "Guttering"]), council: `${city} City Council` }
            : {};

      const lead: Row = {
        id,
        campaign_id: campaignId,
        batch_id: fixedId(7, ci + 1),
        data_source_id: campaignSource[ci],
        first_name: first,
        last_name: last,
        company_name: company,
        job_title: def.audience === "b2b" ? pick(JOB_TITLES) : "Homeowner",
        phone_e164: phone,
        phone_raw: phone,
        phone_type: "mobile",
        alt_phone_e164: null,
        email: `${first}.${last}${int(1, 99)}@example.com`.toLowerCase(),
        address_line1: `${int(1, 220)} ${pick(STREETS)}`,
        address_line2: null,
        city,
        region,
        postcode: isUS ? pc : `${pc} ${int(1, 9)}${pick(["AB", "DF", "GH", "JR", "WX"])}`,
        country_code: isUS ? "US" : "GB",
        lead_timezone: def.tz,
        status: "assigned",
        screening_status,
        screened_at: screening_status === "passed" ? iso(now - int(1, 14) * DAY) : screening_status === "expired" ? iso(now - 40 * DAY) : null,
        screening_run_id: null,
        do_not_call: false,
        dnc_reason: null,
        dnc_set_at: null,
        consent_status: def.audience === "b2c" ? "granted" : null,
        consent_source: def.audience === "b2c" ? "web_form" : null,
        consent_captured_at: def.audience === "b2c" ? iso(createdMs - 2 * DAY) : null,
        consent_evidence_path: null,
        attempt_count: 0,
        last_attempt_at: null,
        last_disposition_id: null,
        next_action_at: null,
        assigned_to: assigned,
        assigned_at: iso(createdMs + HOUR),
        lead_score: int(20, 95),
        external_ref: null,
        retention_expires_at: iso(now + 300 * DAY),
        custom,
        created_at: iso(createdMs),
        updated_at: iso(createdMs),
      };

      // ~40% untouched (fresh in the queue), the rest have 1-4 attempts.
      const nAttempts = screening_status !== "passed" ? 0 : rnd() < 0.4 ? 0 : int(1, 4);
      const days = Array.from({ length: nAttempts }, () => (rnd() < 0.3 ? 0 : int(1, 12))).sort((a, b) => b - a);
      let lastCode: string | null = null;
      for (let a = 0; a < nAttempts; a++) {
        const isLast = a === nAttempts - 1;
        let code = isLast ? pickOutcome() : pick(["no_answer", "voicemail", "busy", "no_answer"]);
        if (!isLast && rnd() < 0.2) code = "connected_callback";
        const started = callTime(days[a], def.market);
        const connected = String(dispoByCode.get(code)!.category).startsWith("connected");
        const talk = connected ? int(45, 540) : int(0, 25);
        attempts.push({
          id: genId(),
          lead_id: id,
          campaign_id: campaignId,
          agent_id: assigned,
          attempt_no: a + 1,
          disposition_id: dispoByCode.get(code)!.id,
          started_at: iso(started),
          ended_at: iso(started + talk * 1000),
          talk_seconds: talk,
          wrap_seconds: int(10, 90),
          notes: connected ? pick([
            "Spoke to the decision maker, keen to hear more.",
            "Asked for pricing by email first.",
            "Busy on site — call back after 4pm.",
            "Happy with current provider for now.",
            "Wants a Zoom walkthrough with their partner present.",
            null,
          ]) : null,
          lead_local_time: iso(started),
          within_call_window: rnd() > 0.03,
          offshore_disclosure_given: def.market === "UK" ? true : null,
          screening_run_id: null,
          created_at: iso(started),
        });
        lead.attempt_count = a + 1;
        lead.last_attempt_at = iso(started);
        lead.last_disposition_id = dispoByCode.get(code)!.id;
        lastCode = code;
      }
      if (lastCode) {
        lead.status = statusFor(lastCode);
        lead.updated_at = lead.last_attempt_at;
        if (dispoByCode.get(lastCode)!.sets_dnc) {
          lead.do_not_call = true;
          lead.dnc_reason = "verbal_dnc";
          lead.dnc_set_at = lead.last_attempt_at;
          suppression.push({
            phone_e164: phone,
            reason: "verbal_dnc",
            added_by: assigned,
            lead_id: id,
            market: def.market,
            source: "agent",
            evidence_note: "Customer asked not to be called again.",
            is_permanent: true,
            expires_at: null,
            created_at: lead.last_attempt_at,
          });
        }
        if (lastCode === "connected_callback" || lastCode === "interested_follow_up") {
          const due = now + int(-90, 300) * MIN;
          lead.next_action_at = iso(due);
          followups.push({
            id: genId(),
            lead_id: id,
            campaign_id: campaignId,
            assigned_to: assigned,
            created_by: assigned,
            followup_type: lastCode === "connected_callback" ? "callback" : "follow_up",
            due_at: iso(due),
            due_at_lead_local: iso(due),
            note: pick(["Call back after school run", "Wants to confirm with spouse", "Send brochure first", "Prefers Zoom — send link", null]),
            priority: pick(["normal", "normal", "high"]),
            status: due < now ? "pending" : "pending",
            snooze_count: 0,
            reminded_at: null,
            escalated_at: null,
            completed_at: null,
            completed_call_id: null,
            created_at: lead.last_attempt_at,
          });
        }
      } else if (screening_status !== "passed") {
        lead.status = "new";
      }
      leads.push(lead);
    }
  });

  // Extra TPS/complaint suppressions so compliance has variety.
  const reasons = ["tps", "tps", "client_supplied_dnc", "complaint", "wrong_number", "internal_optout", "us_national_dnc", "litigator"];
  reasons.forEach((reason, i) =>
    suppression.push({
      phone_e164: reason === "us_national_dnc" || reason === "litigator" ? `+1512${int(2000000, 9999999)}` : `+447${int(100000000, 999999999)}`,
      reason,
      added_by: i % 2 ? DEMO_IDS.ops : DEMO_IDS.admin,
      lead_id: null,
      market: reason.startsWith("us") || reason === "litigator" ? "US" : "UK",
      source: reason === "tps" ? "tps_bureau" : "manual",
      evidence_note: reason === "complaint" ? "Complaint logged via client — permanent block." : null,
      is_permanent: reason !== "tps",
      expires_at: reason === "tps" ? iso(now + 20 * DAY) : null,
      created_at: iso(now - int(1, 40) * DAY),
    }),
  );

  table("suppression_runs").push(
    { id: genId(), provider: "manual_evidence", provider_reference: "TPS-BUREAU-2291", campaign_id: DEMO_IDS.campaigns[0], batch_id: fixedId(7, 1), numbers_submitted: 95, numbers_matched: 4, ran_at: iso(now - 6 * DAY), ran_by: DEMO_IDS.ops, valid_until: iso(now + 22 * DAY), evidence_path: "evidence/tps-2291.csv" },
    { id: genId(), provider: "manual_evidence", provider_reference: "TPS-BUREAU-2302", campaign_id: DEMO_IDS.campaigns[1], batch_id: fixedId(7, 2), numbers_submitted: 95, numbers_matched: 3, ran_at: iso(now - 3 * DAY), ran_by: DEMO_IDS.ops, valid_until: iso(now + 25 * DAY), evidence_path: "evidence/tps-2302.csv" },
    { id: genId(), provider: "internal", provider_reference: null, campaign_id: DEMO_IDS.campaigns[2], batch_id: fixedId(7, 3), numbers_submitted: 95, numbers_matched: 2, ran_at: iso(now - 2 * DAY), ran_by: DEMO_IDS.admin, valid_until: iso(now + 29 * DAY), evidence_path: null },
  );

  // --- shifts & attendance ---
  const shiftUk = fixedId(9, 1);
  const shiftUs = fixedId(9, 2);
  table("shifts").push(
    { id: shiftUk, name: "UK day shift", start_time: "13:00", end_time: "22:00", timezone: "Asia/Karachi", days_of_week: [1, 2, 3, 4, 5], grace_minutes: 10, break_allowance_minutes: 60, crosses_midnight: false, is_active: true, created_at: iso(now - 150 * DAY) },
    { id: shiftUs, name: "US night shift", start_time: "18:00", end_time: "03:00", timezone: "Asia/Karachi", days_of_week: [1, 2, 3, 4, 5], grace_minutes: 10, break_allowance_minutes: 60, crosses_midnight: true, is_active: true, created_at: iso(now - 150 * DAY) },
  );
  DEMO_IDS.agents.forEach((uid, i) =>
    table("shift_assignments").push({ id: genId(), user_id: uid, shift_id: i < 4 ? shiftUk : shiftUs, effective_from: dateOnly(now - 90 * DAY), effective_to: null, created_at: iso(now - 90 * DAY) }),
  );
  [DEMO_IDS.leadFalcons, DEMO_IDS.leadEagles, DEMO_IDS.qa].forEach((uid, i) =>
    table("shift_assignments").push({ id: genId(), user_id: uid, shift_id: i === 1 ? shiftUs : shiftUk, effective_from: dateOnly(now - 90 * DAY), effective_to: null, created_at: iso(now - 90 * DAY) }),
  );

  const sessions = table("attendance_sessions");
  const aux = table("aux_logs");
  const liveStates = ["on_call", "on_call", "available", "after_call_work", "on_call", "break", "available", "on_call"];
  DEMO_IDS.agents.forEach((uid, i) => {
    for (let d = 13; d >= 0; d--) {
      const dayMs = startOfToday - d * DAY;
      const dow = new Date(dayMs).getUTCDay();
      if (dow === 0) continue;
      const late = rnd() < 0.15 ? int(3, 25) : 0;
      const clockIn = Math.min(dayMs + (8 + (i >= 4 ? 5 : 0)) * HOUR + late * MIN, now - (40 + i * 7) * MIN);
      const isToday = d === 0;
      // Agent 7 hasn't clocked in yet today — shows an "absent so far" row.
      if (isToday && i === 6) continue;
      const worked = isToday ? Math.round((now - clockIn) / MIN) : int(470, 540);
      const brk = isToday ? int(0, 30) : int(40, 65);
      const sid = genId();
      sessions.push({
        id: sid,
        user_id: uid,
        shift_id: i < 4 ? shiftUk : shiftUs,
        work_date: dateOnly(dayMs),
        clock_in_at: iso(clockIn),
        clock_out_at: isToday ? null : iso(clockIn + worked * MIN),
        clock_in_ip: "203.0.113.10",
        clock_out_ip: isToday ? null : "203.0.113.10",
        clock_in_device: "web",
        status: late ? "late" : "present",
        late_minutes: late,
        early_leave_minutes: 0,
        worked_minutes: isToday ? 0 : worked,
        break_minutes: brk,
        productive_minutes: isToday ? 0 : Math.max(worked - brk, 0),
        is_manual_entry: false,
        manual_reason: null,
        agent_note: null,
        lead_note: null,
        approved_at: null,
        approved_by: null,
        created_at: iso(clockIn),
      });
      if (isToday) {
        aux.push({ id: genId(), session_id: sid, user_id: uid, state: "available", reason: null, started_at: iso(clockIn), ended_at: iso(now - 20 * MIN), duration_seconds: Math.round((now - 20 * MIN - clockIn) / 1000) });
        aux.push({ id: genId(), session_id: sid, user_id: uid, state: liveStates[i], reason: liveStates[i] === "break" ? "Tea break" : null, started_at: iso(now - int(1, 19) * MIN), ended_at: null, duration_seconds: null });
      }
    }
  });
  // Staff who aren't agents are clocked in too (so the header shows the control).
  [DEMO_IDS.leadFalcons, DEMO_IDS.qa].forEach((uid) => {
    const sid = genId();
    sessions.push({ id: sid, user_id: uid, shift_id: shiftUk, work_date: today, clock_in_at: iso(now - 3 * HOUR), clock_out_at: null, clock_in_ip: "203.0.113.11", clock_out_ip: null, clock_in_device: "web", status: "present", late_minutes: 0, early_leave_minutes: 0, worked_minutes: 0, break_minutes: 0, productive_minutes: 0, is_manual_entry: false, manual_reason: null, agent_note: null, lead_note: null, approved_at: null, approved_by: null, created_at: iso(now - 3 * HOUR) });
    aux.push({ id: genId(), session_id: sid, user_id: uid, state: "available", reason: null, started_at: iso(now - 3 * HOUR), ended_at: null, duration_seconds: null });
  });

  table("leave_requests").push(
    { id: genId(), user_id: DEMO_IDS.agents[2], leave_type: "annual", from_date: dateOnly(now + 5 * DAY), to_date: dateOnly(now + 7 * DAY), is_half_day: false, reason: "Family wedding in Lahore", status: "pending", decided_at: null, decided_by: null, decision_note: null, created_at: iso(now - 1 * DAY) },
    { id: genId(), user_id: DEMO_IDS.agents[5], leave_type: "sick", from_date: dateOnly(now + 1 * DAY), to_date: dateOnly(now + 1 * DAY), is_half_day: true, reason: "Doctor's appointment", status: "pending", decided_at: null, decided_by: null, decision_note: null, created_at: iso(now - 3 * HOUR) },
    { id: genId(), user_id: DEMO_IDS.agents[3], leave_type: "annual", from_date: dateOnly(now - 9 * DAY), to_date: dateOnly(now - 8 * DAY), is_half_day: false, reason: "Eid travel", status: "approved", decided_at: iso(now - 12 * DAY), decided_by: DEMO_IDS.ops, decision_note: "Enjoy!", created_at: iso(now - 14 * DAY) },
  );

  table("holidays").push(
    { id: genId(), holiday_date: dateOnly(now + 20 * DAY), name: "Bank holiday", market: "UK" },
    { id: genId(), holiday_date: dateOnly(now + 45 * DAY), name: "Thanksgiving", market: "US" },
  );

  // --- email ---
  table("email_templates").push(
    { id: fixedId(10, 1), campaign_id: DEMO_IDS.campaigns[0], name: "Roof survey confirmation", subject: "Your free roof health check, {{first_name}}", body_html: "<p>Hi {{first_name}},</p><p>Thanks for your time on the phone today. Your free roof health check is booked — our surveyor will confirm the exact slot shortly.</p><p>Kind regards,<br>Northwind Roofing</p>", body_text: null, from_name: "Northwind Roofing", from_email: "hello@mail.callmilalo.demo", reply_to: "bookings@northwind-roofing.example", merge_fields: ["first_name"], requires_approval: false, approved_at: iso(now - 20 * DAY), approved_by: DEMO_IDS.ops, is_active: true, created_at: iso(now - 20 * DAY) },
    { id: fixedId(10, 2), campaign_id: null, name: "Zoom meeting follow-up", subject: "Your Zoom call with us, {{first_name}}", body_html: "<p>Hi {{first_name}},</p><p>As promised, here's a summary of our call. I've sent a separate Zoom invite for the consultation.</p><p>Speak soon!</p>", body_text: null, from_name: "CallMilalo", from_email: "hello@mail.callmilalo.demo", reply_to: null, merge_fields: ["first_name"], requires_approval: false, approved_at: iso(now - 10 * DAY), approved_by: DEMO_IDS.admin, is_active: true, created_at: iso(now - 10 * DAY) },
    { id: fixedId(10, 3), campaign_id: DEMO_IDS.campaigns[3], name: "SEO audit — what to expect", subject: "3 quick wins for {{company_name}}", body_html: "<p>Hi {{first_name}},</p><p>Ahead of our Zoom audit, here are the three areas we'll look at…</p>", body_text: null, from_name: "Crescent Digital", from_email: "hello@mail.callmilalo.demo", reply_to: null, merge_fields: ["first_name", "company_name"], requires_approval: false, approved_at: iso(now - 7 * DAY), approved_by: DEMO_IDS.ops, is_active: true, created_at: iso(now - 7 * DAY) },
  );
  const emailLeads = leads.filter((l) => l.status === "qualified" || l.status === "converted").slice(0, 14);
  emailLeads.forEach((l, i) => {
    const sent = now - int(1, 200) * HOUR;
    table("email_sends").push({ id: genId(), lead_id: l.id, campaign_id: l.campaign_id, template_id: fixedId(10, i % 2 ? 2 : 1), agent_id: l.assigned_to, to_email: l.email, subject_sent: `Following up, ${l.first_name}`, body_sent_html: "<p>…</p>", status: pick(["sent", "delivered", "opened", "opened", "clicked"]), sent_at: iso(sent), delivered_at: iso(sent + MIN), opened_at: rnd() < 0.6 ? iso(sent + int(10, 300) * MIN) : null, clicked_at: null, provider_message_id: `demo_${i}`, provider_error: null, created_at: iso(sent) });
  });
  table("email_suppression").push(
    { email: "unsubscribed.person@example.com", reason: "unsubscribe", created_at: iso(now - 12 * DAY) },
    { email: "bounced.address@example.com", reason: "hard_bounce", created_at: iso(now - 4 * DAY) },
  );

  // --- QA ---
  const scorecardId = fixedId(11, 1);
  table("qa_scorecards").push({
    id: scorecardId,
    campaign_id: null,
    name: "Standard outbound scorecard",
    pass_threshold: 75,
    is_active: true,
    criteria: [
      { key: "greeting", label: "Correct greeting & company named", weight: 1, max_score: 10, is_fatal: false },
      { key: "disclosure", label: "Offshore / recording disclosure given", weight: 1, max_score: 20, is_fatal: true },
      { key: "discovery", label: "Asked qualifying questions", weight: 1, max_score: 20, is_fatal: false },
      { key: "objections", label: "Handled objections professionally", weight: 1, max_score: 15, is_fatal: false },
      { key: "next_step", label: "Agreed a clear next step (callback / Zoom / appointment)", weight: 1, max_score: 20, is_fatal: false },
      { key: "dnc_respected", label: "Respected any do-not-call request", weight: 1, max_score: 15, is_fatal: true },
    ],
    created_at: iso(now - 60 * DAY),
  });
  const connectedAttempts = attempts.filter((a) => (a.talk_seconds as number) > 60);
  connectedAttempts.slice(0, 18).forEach((a, i) => {
    const total = int(55, 100);
    table("qa_reviews").push({
      id: genId(),
      call_attempt_id: a.id,
      agent_id: a.agent_id,
      reviewer_id: DEMO_IDS.qa,
      scorecard_id: scorecardId,
      scores: {},
      total_score: total,
      passed: total >= 75,
      fatal_breach: i === 4,
      coaching_notes: total >= 75 ? "Great rapport and clear next step." : "Slow down on the disclosure and confirm the callback time.",
      agent_acknowledged_at: rnd() < 0.5 ? iso(now - int(1, 48) * HOUR) : null,
      created_at: iso(now - int(1, 120) * HOUR),
    });
  });

  // --- data sourcing runs ---
  const runs = table("source_fetch_runs");
  [
    [fixedId(6, 1), DEMO_IDS.campaigns[3], "succeeded", 120, 88, 12, DEMO_IDS.teamEagles],
    [fixedId(6, 2), DEMO_IDS.campaigns[0], "succeeded", 64, 51, 4, DEMO_IDS.teamFalcons],
    [fixedId(6, 5), DEMO_IDS.campaigns[2], "failed", 0, 0, 0, null],
    [fixedId(6, 1), DEMO_IDS.campaigns[3], "succeeded", 45, 39, 2, null],
  ].forEach(([ds, cid, status, found, imported, rejected, team], i) => {
    const started = now - (i * 3 + 1) * DAY;
    runs.push({ id: genId(), data_source_id: ds, campaign_id: cid, status, params: { query: "construction" }, records_found: found, records_imported: imported, records_rejected: rejected, skip_screening: false, started_at: iso(started), finished_at: iso(started + 3 * MIN), error: status === "failed" ? "Socrata dataset field map not configured (fieldMap.phone missing)." : null, raw_response_path: null, triggered_by: DEMO_IDS.ops, assigned_to: null, assigned_team_id: team, created_at: iso(started) });
  });

  // --- unphoned contacts (need a phone number before they can be dialled) ---
  ["Graham Porter", "Lucy Barnes", "Imran Chaudhry"].forEach((name, i) => {
    const [first_name, last_name] = name.split(" ");
    table("unphoned_contacts").push({ id: genId(), campaign_id: DEMO_IDS.campaigns[0], data_source_id: fixedId(6, 2), assigned_to: DEMO_IDS.agents[0], first_name, last_name, email: `${first_name.toLowerCase()}@example.com`, role: pick(["Architect", "Developer", "Site manager"]), person_ref: `P-${1000 + i}`, project_ref: `PRJ-${500 + i}`, project_title: pick(["Loft conversion, 14 Mill Lane", "New build — 6 townhouses", "Commercial re-roof"]), project_town: pick(UK_CITIES)[0], project_value: int(40, 900) * 1000, company_ref: null, contact_added_on: dateOnly(now - 5 * DAY), country_hint: "GB", phone_raw: null, custom: {}, promoted_at: null, promoted_lead_id: null, created_at: iso(now - 5 * DAY), updated_at: iso(now - 5 * DAY) });
  });

  // --- security ---
  const allStaff = table("profiles").filter((p) => p.is_active);
  allStaff.forEach((p) => {
    table("user_sessions").push({ id: genId(), user_id: p.id, started_at: iso(now - int(1, 8) * HOUR), last_seen_at: iso(now - int(0, 30) * MIN), ended_at: null, ended_reason: null, ip: `203.0.113.${int(2, 250)}`, user_agent: pick(["Chrome 131 / Windows", "Edge 131 / Windows", "Safari / iPhone", "Chrome / Android"]) });
  });
  let seq = 0;
  const credEvents = table("credential_events");
  allStaff.slice(0, 8).forEach((p) => {
    credEvents.push({ id: ++seq, user_id: p.id, actor_id: DEMO_IDS.admin, event: "created", ip: "203.0.113.1", note: null, created_at: iso(now - int(60, 200) * DAY) });
    credEvents.push({ id: ++seq, user_id: p.id, actor_id: p.id, event: "changed_by_user", ip: "203.0.113.2", note: null, created_at: iso(now - int(20, 59) * DAY) });
  });
  credEvents.push({ id: ++seq, user_id: DEMO_IDS.agents[3], actor_id: DEMO_IDS.ops, event: "reset_by_admin", ip: "203.0.113.4", note: "Forgot password", created_at: iso(now - 2 * DAY) });

  const audit = table("audit_log");
  const auditSamples: [string, string, string, string | null][] = [
    ["UPDATE", "campaigns", DEMO_IDS.campaigns[0], DEMO_IDS.ops],
    ["INSERT", "campaign_assignments", DEMO_IDS.campaigns[1], DEMO_IDS.ops],
    ["INSERT", "suppression_list", "+447700900123", DEMO_IDS.admin],
    ["UPDATE", "profiles", DEMO_IDS.agents[3], DEMO_IDS.ops],
    ["INSERT", "data_sources", fixedId(6, 5), DEMO_IDS.admin],
    ["UPDATE", "leave_requests", DEMO_IDS.agents[3], DEMO_IDS.ops],
    ["INSERT", "email_templates", fixedId(10, 3), DEMO_IDS.ops],
    ["INSERT", "zoom_meetings", "zoom", DEMO_IDS.agents[0]],
  ];
  auditSamples.forEach(([action, entity_type, entity_id, actor_id], i) =>
    audit.push({ id: ++seq, action, entity_type, entity_id, actor_id, before_data: null, after_data: null, ip: "203.0.113.5", user_agent: "Chrome 131 / Windows", created_at: iso(now - (i + 1) * 5 * HOUR) }),
  );

  // --- Zoom ---
  const meetings = table("zoom_meetings");
  const zoomLeads = leads.filter((l) => l.status === "qualified" || l.status === "converted");
  const meetingPlan: [number, number, string][] = [
    // offset minutes from now, duration, status
    [25, 20, "scheduled"],
    [95, 30, "scheduled"],
    [60 * 20, 15, "scheduled"],
    [60 * 26, 30, "scheduled"],
    [60 * 49, 20, "scheduled"],
    [60 * 72, 45, "scheduled"],
    [-10, 30, "started"],
    [-60 * 3, 25, "ended"],
    [-60 * 26, 20, "ended"],
    [-60 * 50, 30, "ended"],
    [-60 * 75, 15, "ended"],
    [-60 * 98, 40, "ended"],
    [-60 * 30, 20, "cancelled"],
  ];
  const summaries = [
    "Prospect confirmed budget of ~£8k and wants the survey before month end. Next step: surveyor visit booked for Tuesday 10:00.",
    "Walked through savings estimate (£1,140/yr). Partner joined halfway; both keen. Sent proposal PDF and financing options.",
    "Reviewed Medicare supplement Plan G vs N. Prospect prefers Plan G; licensed advisor to follow up with enrolment pack.",
    "SEO audit: 3 quick wins agreed (GMB listing, service pages, backlinks). Proposal to be sent by Friday.",
    "Client raised concern about timeline; agreed phased approach starting next month.",
  ];
  meetingPlan.forEach(([offset, duration, status], i) => {
    const lead = zoomLeads[i % zoomLeads.length];
    const ci = DEMO_IDS.campaigns.indexOf(lead.campaign_id as string);
    const meetingNumber = String(8100000000 + int(1000000, 99999999));
    const start = now + offset * MIN;
    meetings.push({
      id: genId(),
      zoom_meeting_id: meetingNumber,
      topic: `${campaignDefs[ci].code}: ${pick(["Consultation", "Discovery call", "Quote walkthrough", "Survey pre-check"])} with ${lead.first_name} ${lead.last_name}`,
      agenda: pick(["Review requirements and next steps.", "Walk through the personalised quote.", "Answer questions before booking the visit."]),
      start_time: iso(start),
      duration_minutes: duration,
      timezone: campaignDefs[ci].tz,
      join_url: `https://zoom.us/j/${meetingNumber}?pwd=demo${i}`,
      start_url: `https://zoom.us/s/${meetingNumber}?zak=demo`,
      password: String(int(100000, 999999)),
      host_id: lead.assigned_to,
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      invitee_name: `${lead.first_name} ${lead.last_name}`,
      invitee_email: lead.email,
      status,
      source: "demo",
      participants: status === "ended" ? int(2, 4) : null,
      actual_duration_minutes: status === "ended" ? Math.max(duration - int(-5, 8), 5) : null,
      recording_url: status === "ended" ? `https://zoom.us/rec/share/demo-${meetingNumber}` : null,
      ai_summary: status === "ended" ? summaries[i % summaries.length] : null,
      created_at: iso(Math.min(start, now) - int(1, 72) * HOUR),
    });
  });

  table("integrations").push({
    id: "zoom",
    provider: "zoom",
    connected: true,
    account_email: "calls@callmilalo.demo",
    account_name: "CallMilalo Contact Centre",
    plan: "Zoom Workplace Business",
    connected_at: iso(now - 30 * DAY),
    connected_by: DEMO_IDS.admin,
    settings: { auto_recording: "cloud", waiting_room: true, ai_companion: true, add_to_followups: true },
  });

  // --- Dialer / telephony ---
  // The client's dialer subscription (switchable on the Integrations page)
  // plus a call log that mirrors the dialled call attempts above.
  const DIALER_NUMBERS = ["+442038076512", "+441615550199", "+15125550143"];
  table("integrations").push({
    id: "dialer",
    provider: "zoom_phone",
    connected: true,
    account_email: "calls@callmilalo.demo",
    account_name: "CallMilalo Contact Centre",
    plan: "Zoom Phone Pro (8 licences)",
    connected_at: iso(now - 30 * DAY),
    connected_by: DEMO_IDS.admin,
    settings: {
      caller_id: DIALER_NUMBERS[0],
      numbers: DIALER_NUMBERS,
      dial_mode: "click_to_call",
      record_calls: true,
      local_presence: true,
      auto_log_calls: true,
      agent_extension: "",
      credentials_masked: { account_id: "••••7Q2k", client_id: "••••hG4x", client_secret: "••••••••" },
    },
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));
  [...attempts]
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))
    .slice(0, 60)
    .forEach((a) => {
      const l = leadById.get(a.lead_id)!;
      const talk = (a.talk_seconds as number) ?? 0;
      const connected = talk > 30;
      const isUS = l.country_code === "US";
      table("dialer_calls").push({
        id: genId(),
        provider: "zoom_phone",
        provider_call_id: `zoom_phone_${String(a.id).slice(-8)}`,
        direction: "outbound",
        from_number: isUS ? DIALER_NUMBERS[2] : DIALER_NUMBERS[0],
        to_number: l.phone_e164,
        lead_id: l.id,
        campaign_id: a.campaign_id,
        agent_id: a.agent_id,
        status: connected ? "completed" : "missed",
        started_at: a.started_at,
        answered_at: connected ? iso(new Date(a.started_at as string).getTime() + 6000) : null,
        ended_at: a.ended_at,
        duration_seconds: talk,
        recording_url: connected ? `https://zoom.us/recording/demo-${String(a.id).slice(-6)}` : null,
        created_at: a.started_at,
      });
    });

  // Tables that start empty but must exist.
  ["client_agent_labels", "campaign_fields", "rate_limit_hits"].forEach((n) => table(n));

  return {
    tables: t,
    seq: seq + 1000,
    version: 1,
    seededAt: new Date().toISOString(),
  };
}
