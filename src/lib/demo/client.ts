import "server-only";
import { getStore, newId, nowIso } from "./store";
import { DemoQueryBuilder } from "./query";
import { DEMO_PASSWORD } from "./seed";
import { runRpc } from "./rpc";
import type { DemoAuthContext } from "./rls";

export const DEMO_COOKIE = "callmilalo_demo_user";

export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
}

function authContextFor(userId: string | null, bypass = false): DemoAuthContext {
  if (!userId) return { userId: null, role: null, clientId: null, bypass };
  const profile = getStore().tables.profiles.find((p) => p.id === userId);
  return {
    userId,
    role: (profile?.role as string) ?? null,
    clientId: (profile?.client_id as string) ?? null,
    bypass,
  };
}

function emailFor(userId: string) {
  return (getStore().tables.demo_auth.find((a) => a.id === userId)?.email as string) ?? `${userId}@callmilalo.demo`;
}

const noopChannel = {
  on() {
    return noopChannel;
  },
  subscribe() {
    return noopChannel;
  },
  unsubscribe() {
    return Promise.resolve("ok");
  },
};

// Builds a Supabase-shaped client backed by the in-memory store. `jar` is
// optional: route handlers and the service-role client don't carry a user.
export function createDemoClient(opts: { jar?: CookieJar; bypassRls?: boolean } = {}) {
  const currentUserId = () => {
    const id = opts.jar?.get(DEMO_COOKIE) ?? null;
    if (!id) return null;
    const exists = getStore().tables.profiles.some((p) => p.id === id && p.is_active);
    return exists ? id : null;
  };
  const ctx = () => authContextFor(currentUserId(), opts.bypassRls);

  return {
    from(table: string) {
      return new DemoQueryBuilder(table, ctx());
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      const result = runRpc(fn, args, ctx());
      return Promise.resolve({ ...result, count: null, status: result.error ? 400 : 200, statusText: "" });
    },
    channel() {
      return noopChannel;
    },
    removeChannel() {
      return Promise.resolve("ok");
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string) => ({ data: { path, fullPath: `${bucket}/${path}` }, error: null }),
          download: async () => ({ data: new Blob(["Demo file — storage is not connected in demo mode."]), error: null }),
          remove: async () => ({ data: [], error: null }),
          createSignedUrl: async (path: string) => ({ data: { signedUrl: `/api/demo/file?path=${encodeURIComponent(path)}` }, error: null }),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `/api/demo/file?path=${encodeURIComponent(path)}` } }),
        };
      },
    },
    auth: {
      async getUser() {
        const id = currentUserId();
        if (!id) return { data: { user: null }, error: { message: "Auth session missing!" } };
        return { data: { user: { id, email: emailFor(id), role: "authenticated" } }, error: null };
      },
      async getSession() {
        const id = currentUserId();
        return { data: { session: id ? { user: { id, email: emailFor(id) } } : null }, error: null };
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const store = getStore();
        const account = store.tables.demo_auth.find((a) => String(a.email).toLowerCase() === email.toLowerCase());
        const profile = account && store.tables.profiles.find((p) => p.id === account.id && p.is_active);
        if (!account || !profile || password !== (account.password ?? DEMO_PASSWORD)) {
          return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
        }
        opts.jar?.set(DEMO_COOKIE, String(account.id));
        const user = { id: account.id as string, email: account.email as string };
        return { data: { user, session: { user } }, error: null };
      },
      async signOut() {
        opts.jar?.delete(DEMO_COOKIE);
        return { error: null };
      },
      async updateUser() {
        return { data: { user: null }, error: null };
      },
      admin: {
        async createUser({ email }: { email: string }) {
          const store = getStore();
          if (store.tables.demo_auth.some((a) => String(a.email).toLowerCase() === email.toLowerCase())) {
            return { data: { user: null }, error: { message: "A user with this email address has already been registered" } };
          }
          const id = newId();
          store.tables.demo_auth.push({ id, email, password: DEMO_PASSWORD, created_at: nowIso() });
          return { data: { user: { id, email } }, error: null };
        },
        async deleteUser(id: string) {
          const store = getStore();
          store.tables.demo_auth = store.tables.demo_auth.filter((a) => a.id !== id);
          return { data: {}, error: null };
        },
        async updateUserById() {
          return { data: { user: null }, error: null };
        },
      },
    },
  };
}
