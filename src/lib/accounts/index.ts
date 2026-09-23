import "server-only";
import { firebaseAccounts, firebaseConfigured } from "./firebase";
import { localAccounts } from "./local";
import type { AccountsBackend } from "./types";

export * from "./types";

// Firebase once its credentials are set on the deployment, in-memory before.
export function accounts(): AccountsBackend {
  return firebaseConfigured() ? firebaseAccounts : localAccounts;
}
