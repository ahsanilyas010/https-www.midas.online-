import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FREE_AGENT_SEATS } from "@/lib/pricing";
import { AccountError, type AccountsBackend, type Member, type Workspace } from "./types";

// Firebase Auth (logins) + Firestore (workspaces and members).
//
// Firestore layout:
//   workspaces/{workspaceId}  Workspace (plan, agent seats, billing, sign-up source)
//   members/{uid}             Member (workspace, role, name, active)
//
// Server-only: everything goes through the Admin SDK with a service
// account, and passwords are checked with the Identity Toolkit REST API, so
// no Firebase code or config ships to the browser.

const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function firebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY &&
      process.env.FIREBASE_WEB_API_KEY,
  );
}

function app(): App {
  const existing = getApps().find((a) => a.name === "callmilalo");
  if (existing) return existing;
  return initializeApp(
    {
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Env vars can't hold real newlines everywhere; accept "\n" escapes.
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    },
    "callmilalo",
  );
}

const auth = () => getAuth(app());
const db = () => getFirestore(app());
const workspaces = () => db().collection("workspaces");
const members = () => db().collection("members");

// Removes undefined values, which Firestore rejects.
function clean<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

async function passwordSignIn(email: string, password: string): Promise<{ idToken: string; uid: string }> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: "no-store",
    },
  );
  const body = (await res.json()) as { idToken?: string; localId?: string; error?: { message?: string } };
  if (!res.ok || !body.idToken || !body.localId) {
    const code = body.error?.message ?? "";
    if (code.startsWith("USER_DISABLED")) throw new AccountError("disabled", "This account has been deactivated.");
    if (code.startsWith("TOO_MANY_ATTEMPTS")) throw new AccountError("unavailable", "Too many attempts. Wait a few minutes and try again.");
    throw new AccountError("invalid_credentials", "Incorrect email or password.");
  }
  return { idToken: body.idToken, uid: body.localId };
}

function authError(e: unknown): never {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "auth/email-already-exists") throw new AccountError("email_exists", "An account with this email already exists.");
  if (code === "auth/invalid-password") throw new AccountError("weak_password", "Choose a stronger password (at least 8 characters).");
  if (code === "auth/invalid-email") throw new AccountError("invalid_credentials", "Enter a valid email address.");
  throw e;
}

export const firebaseAccounts: AccountsBackend = {
  kind: "firebase",

  async createWorkspace(input) {
    const user = await auth()
      .createUser({ email: input.email, password: input.password, displayName: input.fullName })
      .catch(authError);
    const now = new Date().toISOString();
    const wsRef = workspaces().doc();
    const workspace: Workspace = {
      id: wsRef.id,
      name: input.workspaceName,
      ownerUid: user.uid,
      plan: "free",
      agentSeats: FREE_AGENT_SEATS,
      billingStatus: "none",
      teamSize: input.teamSize ?? null,
      phone: input.phone ?? null,
      signup: input.signup,
      createdAt: now,
    };
    const member: Member = {
      uid: user.uid,
      workspaceId: wsRef.id,
      email: input.email,
      fullName: input.fullName,
      role: "super_admin",
      isActive: true,
      mustChangePassword: false,
      createdAt: now,
    };
    try {
      const batch = db().batch();
      batch.set(wsRef, clean(workspace));
      batch.set(members().doc(user.uid), clean(member));
      await batch.commit();
    } catch (e) {
      // Don't leave a login with no workspace behind it.
      await auth().deleteUser(user.uid).catch(() => {});
      throw e;
    }
    return { workspace, member };
  },

  async createMember(input) {
    const user = await auth()
      .createUser({ email: input.email, password: input.password, displayName: input.fullName })
      .catch(authError);
    const member: Member = {
      uid: user.uid,
      workspaceId: input.workspaceId,
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    try {
      await members().doc(user.uid).set(clean(member));
    } catch (e) {
      await auth().deleteUser(user.uid).catch(() => {});
      throw e;
    }
    return member;
  },

  async signIn(email, password) {
    const { idToken, uid } = await passwordSignIn(email, password);
    const member = await this.getMember(uid);
    if (!member) throw new AccountError("not_found", "No workspace is linked to this login.");
    if (!member.isActive) throw new AccountError("disabled", "This account has been deactivated.");
    const token = await auth().createSessionCookie(idToken, { expiresIn: SESSION_SECONDS * 1000 });
    return { token, member, maxAgeSeconds: SESSION_SECONDS };
  },

  async verifySession(token) {
    try {
      const decoded = await auth().verifySessionCookie(token, true);
      const member = await this.getMember(decoded.uid);
      if (!member?.isActive) return null;
      return { uid: member.uid, workspaceId: member.workspaceId };
    } catch {
      return null;
    }
  },

  async revokeSession() {
    // Signing out clears this browser's cookie only; other devices stay
    // signed in. Deactivating a member revokes everything (setMemberActive).
  },

  async setPassword(uid, password) {
    await auth().updateUser(uid, { password }).catch(authError);
  },

  async setMemberActive(uid, active) {
    await auth().updateUser(uid, { disabled: !active });
    if (!active) await auth().revokeRefreshTokens(uid);
    await members().doc(uid).update({ isActive: active });
  },

  async updateMember(uid, patch) {
    await members().doc(uid).update(clean(patch));
    if (patch.fullName) await auth().updateUser(uid, { displayName: patch.fullName });
  },

  async getWorkspace(id) {
    const snap = await workspaces().doc(id).get();
    return snap.exists ? ({ ...(snap.data() as Workspace), id: snap.id }) : null;
  },

  async updateWorkspace(id, patch) {
    await workspaces().doc(id).update(clean(patch));
  },

  async listMembers(workspaceId) {
    const snap = await members().where("workspaceId", "==", workspaceId).get();
    return snap.docs.map((d) => ({ ...(d.data() as Member), uid: d.id }));
  },

  async getMember(uid) {
    const snap = await members().doc(uid).get();
    return snap.exists ? ({ ...(snap.data() as Member), uid: snap.id }) : null;
  },
};
