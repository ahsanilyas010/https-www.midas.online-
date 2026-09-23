// Accounts = real customer sign-ups (as opposed to the seeded demo personas).
//
// A sign-up creates a Workspace (the customer's company) and a Member (the
// person, as its super admin). Members the owner adds later get their own
// logins in the same workspace. Firebase Auth + Firestore store these once
// Firebase is configured (see ./firebase.ts); until then ./local.ts keeps
// them in memory so the flow can be tried on a preview deployment.

export type Role = "super_admin" | "ops_manager" | "team_lead" | "agent" | "qa" | "client_viewer";

export type Plan = "free" | "paid";

export interface SignupSource {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  referrer?: string;
  landing_path?: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerUid: string;
  plan: Plan;
  // How many active agents the workspace may have. 3 on the free plan; the
  // purchased quantity once they upgrade.
  agentSeats: number;
  billingStatus: "none" | "active" | "past_due" | "canceled";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  teamSize?: string | null;
  phone?: string | null;
  signup?: SignupSource;
  createdAt: string;
}

export interface Member {
  uid: string;
  workspaceId: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AccountSession {
  uid: string;
  workspaceId: string;
}

export class AccountError extends Error {
  constructor(
    public code: "email_exists" | "invalid_credentials" | "weak_password" | "not_found" | "disabled" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

export interface AccountsBackend {
  readonly kind: "firebase" | "local";
  // Creates the auth user, the workspace and the owner member.
  createWorkspace(input: {
    email: string;
    password: string;
    fullName: string;
    workspaceName: string;
    teamSize?: string | null;
    phone?: string | null;
    signup?: SignupSource;
  }): Promise<{ workspace: Workspace; member: Member }>;
  // Adds a login to an existing workspace (admin "Add person").
  createMember(input: {
    workspaceId: string;
    email: string;
    password: string;
    fullName: string;
    role: Role;
  }): Promise<Member>;
  // Checks the password and returns a session token for the cookie.
  signIn(email: string, password: string): Promise<{ token: string; member: Member; maxAgeSeconds: number }>;
  verifySession(token: string): Promise<AccountSession | null>;
  revokeSession(token: string): Promise<void>;
  setPassword(uid: string, password: string): Promise<void>;
  setMemberActive(uid: string, active: boolean): Promise<void>;
  updateMember(uid: string, patch: Partial<Pick<Member, "fullName" | "role" | "mustChangePassword">>): Promise<void>;
  getWorkspace(id: string): Promise<Workspace | null>;
  updateWorkspace(id: string, patch: Partial<Omit<Workspace, "id" | "createdAt">>): Promise<void>;
  listMembers(workspaceId: string): Promise<Member[]>;
  getMember(uid: string): Promise<Member | null>;
}
