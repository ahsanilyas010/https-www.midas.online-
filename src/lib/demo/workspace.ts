import "server-only";
import { buildSeed } from "./seed";
import { nowIso, type DemoStore, type Row } from "./store";
import type { Member, Workspace } from "@/lib/accounts/types";

// Each customer workspace gets its own store, separate from the shared demo
// data: starter settings (call outcomes, a QA scorecard, shifts, holidays)
// and none of the sample clients, leads or calls.
//
// NOTE: like the demo store this is held in server memory. Logins,
// workspaces, plans and people live in Firebase (src/lib/accounts); the
// CRM records a workspace creates (campaigns, leads, calls…) move to
// Firestore in the next phase. Until then they reset when the server
// restarts.

const KEY = "__callmilaloWorkspaceStores";

function registry(): Map<string, DemoStore> {
  const g = globalThis as unknown as Record<string, Map<string, DemoStore> | undefined>;
  return (g[KEY] ??= new Map());
}

// Settings a new call centre needs on day one, copied from the demo seed.
function starterTables(): Record<string, Row[]> {
  const seed = buildSeed().tables;
  const empty: Record<string, Row[]> = Object.fromEntries(Object.keys(seed).map((k) => [k, []]));
  return {
    ...empty,
    dispositions: seed.dispositions.filter((d) => d.campaign_id === null),
    qa_scorecards: seed.qa_scorecards.filter((s) => s.campaign_id === null),
    shifts: seed.shifts,
    holidays: seed.holidays,
    email_templates: seed.email_templates
      .filter((t) => t.campaign_id === null)
      .map((t) => ({ ...t, approved_by: null, from_name: null })),
  };
}

function profileFor(m: Member): Row {
  const now = nowIso();
  return {
    id: m.uid,
    full_name: m.fullName,
    role: m.role,
    agent_code: null,
    team_id: null,
    client_id: null,
    phone: null,
    timezone: "America/New_York",
    is_active: m.isActive,
    must_change_password: m.mustChangePassword,
    allow_login_outside_shift: true,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    last_login_ip: null,
    password_set_at: now,
    totp_enabled: false,
    joined_on: m.createdAt.slice(0, 10),
    created_at: m.createdAt,
    updated_at: now,
  };
}

// Returns the workspace's store, creating it on first use, and brings its
// people in line with the accounts backend (which is the source of truth
// for who can sign in, their role and whether they're active).
export function workspaceStore(workspace: Workspace, members: Member[]): DemoStore {
  const reg = registry();
  let store = reg.get(workspace.id);
  if (!store) {
    store = { tables: starterTables(), seq: 1000, version: 1, seededAt: nowIso() };
    reg.set(workspace.id, store);
  }
  const profiles = store.tables.profiles;
  for (const m of members) {
    const existing = profiles.find((p) => p.id === m.uid);
    if (!existing) {
      profiles.push(profileFor(m));
    } else {
      existing.full_name = m.fullName;
      existing.role = m.role;
      existing.is_active = m.isActive;
      existing.must_change_password = m.mustChangePassword;
    }
  }
  return store;
}
