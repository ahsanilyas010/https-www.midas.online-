import "server-only";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { FREE_AGENT_SEATS } from "@/lib/pricing";
import { AccountError, type AccountsBackend, type Member, type Workspace } from "./types";

// In-memory accounts, used until Firebase is configured. Lives on
// globalThis like the demo store, so it is lost when the server restarts
// (and isn't shared between serverless instances). Good for trying the
// sign-up flow on a preview, not for real customers.

interface LocalState {
  workspaces: Map<string, Workspace>;
  members: Map<string, Member>;
  passwords: Map<string, string>; // uid -> "salt:hash"
  emails: Map<string, string>; // lower(email) -> uid
  sessions: Map<string, { uid: string; workspaceId: string; expires: number }>;
}

const KEY = "__callmilaloLocalAccounts";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function state(): LocalState {
  const g = globalThis as unknown as Record<string, LocalState | undefined>;
  return (g[KEY] ??= { workspaces: new Map(), members: new Map(), passwords: new Map(), emails: new Map(), sessions: new Map() });
}

function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function check(password: string, stored: string) {
  const [salt, h] = stored.split(":");
  const a = Buffer.from(h, "hex");
  const b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

function addMember(input: { workspaceId: string; email: string; password: string; fullName: string; role: Member["role"]; mustChangePassword: boolean }) {
  const s = state();
  const key = input.email.toLowerCase();
  if (s.emails.has(key)) throw new AccountError("email_exists", "An account with this email already exists.");
  const member: Member = {
    uid: randomUUID(),
    workspaceId: input.workspaceId,
    email: input.email,
    fullName: input.fullName,
    role: input.role,
    isActive: true,
    mustChangePassword: input.mustChangePassword,
    createdAt: new Date().toISOString(),
  };
  s.members.set(member.uid, member);
  s.passwords.set(member.uid, hash(input.password));
  s.emails.set(key, member.uid);
  return member;
}

export const localAccounts: AccountsBackend = {
  kind: "local",

  async createWorkspace(input) {
    const s = state();
    if (s.emails.has(input.email.toLowerCase())) throw new AccountError("email_exists", "An account with this email already exists.");
    const workspace: Workspace = {
      id: randomUUID(),
      name: input.workspaceName,
      ownerUid: "",
      plan: "free",
      agentSeats: FREE_AGENT_SEATS,
      billingStatus: "none",
      teamSize: input.teamSize ?? null,
      phone: input.phone ?? null,
      signup: input.signup,
      createdAt: new Date().toISOString(),
    };
    const member = addMember({ workspaceId: workspace.id, email: input.email, password: input.password, fullName: input.fullName, role: "super_admin", mustChangePassword: false });
    workspace.ownerUid = member.uid;
    s.workspaces.set(workspace.id, workspace);
    return { workspace, member };
  },

  async createMember(input) {
    return addMember({ ...input, mustChangePassword: true });
  },

  async signIn(email, password) {
    const s = state();
    const uid = s.emails.get(email.toLowerCase());
    const member = uid ? s.members.get(uid) : undefined;
    const stored = uid ? s.passwords.get(uid) : undefined;
    if (!member || !stored || !check(password, stored)) throw new AccountError("invalid_credentials", "Incorrect email or password.");
    if (!member.isActive) throw new AccountError("disabled", "This account has been deactivated.");
    const token = randomBytes(32).toString("base64url");
    s.sessions.set(token, { uid: member.uid, workspaceId: member.workspaceId, expires: Date.now() + SESSION_SECONDS * 1000 });
    return { token, member, maxAgeSeconds: SESSION_SECONDS };
  },

  async verifySession(token) {
    const s = state();
    const session = s.sessions.get(token);
    if (!session || session.expires < Date.now()) return null;
    const member = s.members.get(session.uid);
    if (!member?.isActive) return null;
    return { uid: session.uid, workspaceId: session.workspaceId };
  },

  async revokeSession(token) {
    state().sessions.delete(token);
  },

  async setPassword(uid, password) {
    state().passwords.set(uid, hash(password));
  },

  async setMemberActive(uid, active) {
    const m = state().members.get(uid);
    if (m) m.isActive = active;
  },

  async updateMember(uid, patch) {
    const m = state().members.get(uid);
    if (m) Object.assign(m, patch);
  },

  async getWorkspace(id) {
    return state().workspaces.get(id) ?? null;
  },

  async updateWorkspace(id, patch) {
    const w = state().workspaces.get(id);
    if (w) Object.assign(w, patch);
  },

  async listMembers(workspaceId) {
    return [...state().members.values()].filter((m) => m.workspaceId === workspaceId);
  },

  async getMember(uid) {
    return state().members.get(uid) ?? null;
  },
};
